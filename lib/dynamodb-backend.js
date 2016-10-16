"user strict";
var contract = require('acl/lib/contract');
var lodash = require('lodash');
var aclTableName = 'resources';
var AWS = require('aws-sdk');
var async = require('async');

// Name of the table where meta and allowsXXX are stored.
// If prefix is specified, it will be prepended to this name, like acl_resources
function DynamoDBBackend(db, prefix, useSingle, readCapacityUnits, writeCapacityUnits) {
    this.db = db;
    this.client = new AWS.DynamoDB.DocumentClient({
        service: db
    });
    this.prefix = typeof prefix !== 'undefined' ? prefix : '';
    this.useSingle = (typeof useSingle !== 'undefined') ? useSingle : false;
    this.readCapacityUnits = (typeof readCapacityUnits !== 'undefined') ? readCapacityUnits : 5;
    this.writeCapacityUnits = (typeof writeCapacityUnits !== 'undefined') ? writeCapacityUnits : 5;
    this.tables = [];
}

DynamoDBBackend.prototype = {
    /**
        Begins a transaction.
    */
    begin: function() {
        // returns a transaction object
        return [];
    },

    /**
        Ends a transaction (and executes it)
    */
    end: function(transaction, cb) {
        contract(arguments).params('array', 'function').end();
        // Execute transaction
        async.series(transaction, function(err) {
            console.log(err);
            cb(err instanceof Error ? err : undefined);
        });
    },

    /**
        Cleans the whole storage.
    */
    clean: function(cb) {
        contract(arguments).params('function').end();
        this.tables.forEach(function(table) {
            this.db.deleteTable({
                TableName: table
            }).send();
        });
    },

    /**
        Gets the contents at the bucket's key.
    */
    get: function(bucket, key, cb) {
        contract(arguments)
            .params('string', 'string|number', 'function')
            .end();

        key = encodeText(key);
        var tableName = this.prefix + (this.useSingle ? aclTableName : bucket);
        var params = {
            TableName: tableName,
            Key: {
                key: key
            }
        };
        if (this.useSingle) params.Key._bucketname = bucket;

        this.client.get(params, function(err, data) {
            if (err) return cb(err);
            if (!lodash.isObject(data) || !lodash.isObject(data.Item)) return cb(undefined, []);
            var item = fixKeys(data.Item);
            return cb(undefined, lodash.without(lodash.keys(item), "key", "_id"));
        });

    },

    /**
    	Returns the union of the values in the given keys.
    */
    union: function(bucket, keys, cb) {
        contract(arguments)
            .params('string', 'array', 'function')
            .end();

        var self = this;
        keys = encodeAll(keys);
        var params = {
            RequestItems: {}
        };
        var tableName = self.prefix + (self.useSingle ? aclTableName : bucket);
        params.RequestItems[tableName] = {
            Keys: []
        };
        params.RequestItems[tableName].Keys = lodash.map(keys, function(key) {
            return {
                key: key
            };
        });
        if (self.useSingle)
            params.RequestItems[tableName].Keys = lodash.map(params.RequestItems[tableName].Keys, function(o) {
                o._bucketname = bucket;
                return o;
            });

        var result = {};
        result[tableName] = [];

        function tryUntilSuccess(params, result, retryCount, innercb) {
            //console.log(util.inspect(params, false, 5));
            self.client.batchGet(params, function(err, data) {
                if (err) return innercb(err);

                if (lodash.isObject(data) && lodash.isObject(data.Responses) && lodash.isObject(data.Responses[tableName])) {
                    result[tableName] = result[tableName].concat(data.Responses[tableName]);
                }

                if (lodash.isObject(data) && lodash.isObject(data.UnprocessedKeys) && !lodash.isEmpty(data.UnprocessedKeys)) {
                    retryCount += 1;
                    var nextParams = {
                        RequestItems: data.UnprocessedKeys
                    };
                    if ('ReturnConsumedCapacity' in params) nextParams.ReturnConsumedCapacity = params.ReturnConsumedCapacity;
                    return setTimeout(function() {
                        tryUntilSuccess(nextParams, result, retryCount, innercb);
                    }, Math.pow(retryCount, 2) * 1000);
                } else {
                    //console.log(util.inspect(result, false, 5));
                    result = fixAllKeys(result[tableName]);
                    var keyArrays = [];
                    result.forEach(function(item) {
                        keyArrays.push.apply(keyArrays, lodash.keys(item));
                    });
                    return innercb(undefined, lodash.without(lodash.union(keyArrays), "key", "_id"));
                }
            });
        }

        tryUntilSuccess(params, result, 0, cb);
    },

    /**
    	   Adds values to a given key inside a bucket.
    	*/
    add: function(transaction, bucket, key, values) {
        contract(arguments)
            .params('array', 'string', 'string|number', 'string|array|number')
            .end();
        if (key === "key") throw new Error("Key name 'key' is not allowed.");
        var self = this;
        var tableName = self.prefix + (self.useSingle ? aclTableName : bucket);
        if (!(tableName in self.tables)) {


            transaction.push(function(cb) {
                var params = {
                    TableName: tableName,
                    KeySchema: [{
                        AttributeName: "key",
                        KeyType: "HASH"
                    }],
                    AttributeDefinitions: [{
                        AttributeName: "key",
                        AttributeType: "S"
                    }],
                    ProvisionedThroughput: {
                        ReadCapacityUnits: self.readCapacityUnits,
                        WriteCapacityUnits: self.writeCapacityUnits
                    }
                };

                if (self.useSingle) {
                    params.KeySchema.push({
                        AttributeName: "_bucketname",
                        KeyType: "RANGE"
                    });
                    params.AttributeDefinitions.push({
                        AttributeName: "_bucketname",
                        AttributeType: "S"
                    });
                }

                self.tables.push(tableName);
                self.db.createTable(params, function(err, data) {
                    // Don't care about Errors or response data
                    cb(undefined);
                });

            });


        }
        var params = {
            TableName: tableName,
            Key: {
                key: key
            },
            UpdateExpression: 'SET '
        };
        if (self.useSingle) params.Key._bucketname = bucket;

        values = makeArray(values);
        var names = values.reduce(function (result, value, idx) {
            result['#key' + idx] = value;
            return result;
        }, {});
        params.UpdateExpression += Object.keys(names).map((key) => key + ' = :trueVal').join(', ');
        params.ExpressionAttributeValues = {
            ':trueVal': true
        };

        params.ExpressionAttributeNames = names;
        transaction.push(function(cb) {
            self.client.update(params, function(err, data) {
                if (err instanceof Error) return cb(err);
                return cb(undefined);
            });
        });
    },

    /**
        Delete the given key(s) at the bucket
    */
    del: function(transaction, bucket, keys) {
        contract(arguments)
            .params('array', 'string', 'string|array')
            .end();

        keys = makeArray(keys);
        var self = this;
        var tableName = this.prefix + (this.useSingle ? aclTableName : bucket);
        var params = {
            RequestItems: {}
        };
        params.RequestItems[tableName] = [];
        keys.forEach(function(key) {
            var delRequest = {
                DeleteRequest: {
                    Key: {
                        key: key
                    }
                }
            };
            if (self.useSingle) delRequest.DeleteRequest.Key._bucketname = bucket;
            params.RequestItems[tableName].push(delRequest);
        });
        transaction.push(function(cb) {
            self.client.batchWrite(params, function(err, data) {
                if (err instanceof Error) return cb(err);
                return cb(undefined);
            });
        });
    },

    /**
    	Removes values from a given key inside a bucket.
    */
    remove: function(transaction, bucket, key, values) {
        contract(arguments)
            .params('array', 'string', 'string|number', 'string|array|number')
            .end();

        var self = this;
        var tableName = this.prefix + (this.useSingle ? aclTableName : bucket);
        var params = {
            TableName: tableName,
            Key: {
                key: key
            },
            UpdateExpression: 'REMOVE '
        };
        if (self.useSingle) params.Key._bucketname = bucket;

        values = makeArray(values);
        params.UpdateExpression += values.join(', ');
        transaction.push(function(cb) {
            self.client.update(params, function(err, data) {
                if (err instanceof Error) return cb(err);
                return cb(undefined);
            });
        });
    }
};

function encodeText(text) {
    if (typeof text === 'string' || text instanceof String) {
        text = encodeURIComponent(text);
        text = text.replace(/\./g, '%2E');
    }
    return text;
}

function decodeText(text) {
    if (typeof text === 'string' || text instanceof String) {
        text = decodeURIComponent(text);
    }
    return text;
}

function encodeAll(arr) {
    if (Array.isArray(arr)) {
        var ret = [];
        arr.forEach(function(aval) {
            ret.push(encodeText(aval));
        });
        return ret;
    } else {
        return arr;
    }
}

function fixKeys(doc) {
    if (doc) {
        var ret = {};
        for (var key in doc) {
            if (doc.hasOwnProperty(key)) {
                ret[decodeText(key)] = doc[key];
            }
        }
        return ret;
    } else {
        return doc;
    }
}

function fixAllKeys(docs) {
    if (docs && docs.length) {
        var ret = [];
        docs.forEach(function(adoc) {
            ret.push(fixKeys(adoc));
        });
        return ret;
    } else {
        return docs;
    }
}

function makeArray(arr) {
    return Array.isArray(arr) ? encodeAll(arr) : [encodeText(arr)];
}

exports = module.exports = DynamoDBBackend;
