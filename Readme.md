#NODE ACL - DynamoDB backend
This fork adds DynamoDB backend support to [NODE ACL](https://github.com/OptimalBits/node_acl)

##Status

[![BuildStatus](https://secure.travis-ci.org/nharris85/node_acl_dynamodb.png?branch=master)](http://travis-ci.org/nharris85/node_acl_dynamodb)
[![Dependency Status](https://david-dm.org/nharris85/node_acl_dynamodb.svg)](https://david-dm.org/nharris85/node_acl_dynamodb)
[![devDependency Status](https://david-dm.org/nharris85/node_acl_dynamodb/dev-status.svg)](https://david-dm.org/nharris85/node_acl_dynamodb#info=devDependencies)
##Installation

Using npm:

```javascript
npm install acl-dynamodb
```

##Usage
Download and install [DynamoDB Local](http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Tools.DynamoDBLocal.html#Tools.DynamoDBLocal.DownloadingAndRunning)
Start DynamoDB. See documentation for commandline arguments.
Create DynamoDB database object in your node.js application.
Create acl module and instantiate it with DynamoDB backend, passing the DynamoDB object into the backend instance.

```javascript
var AWS = require('aws-sdk');
// Set local configuration. Note: keys and region can be arbitrary values but must be set
var db = new AWS.DynamoDB({
    endpoint: new AWS.Endpoint("http://localhost:8000"),
    accessKeyId: "myKeyId",
    secretAccessKey: "secretKey",
    region: "us-east-1",
    apiVersion: "2016-01-07"
});

// require acl and create DynamoDB backend
var Acl = require('acl');
// Doesn't set a 'prefix' for collections and separates buckets into multiple collections.
acl = new Acl(new Acl.dynamodbBackend(db));

// Alternatively, set a prefix and combined buckets into a single collection
acl = new Acl(new Acl.dynamodbBackend(db, 'acl_', true));
```

##Documentation
See [NODE ACL documentation](https://github.com/OptimalBits/node_acl#documentation)
See [AWS DynamoDB JS documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html)
See [AWS DynamoDB documentation](http://aws.amazon.com/documentation/dynamodb/)
