module.exports = require('acl');
module.exports.__defineGetter__('dynamodbBackend', function(){
    return require('./lib/dynamodb-backend.js');
});
