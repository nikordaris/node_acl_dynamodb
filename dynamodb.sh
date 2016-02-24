#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR

NAME=dynamodb_local_latest

if [ ! -d "$DIR/$NAME" ]; then
  # download DynamoDB
  mkdir $NAME
  wget http://dynamodb-local.s3-website-us-west-2.amazonaws.com/dynamodb_local_latest.tar.gz
  tar zxf $NAME.tar.gz -C $NAME
fi

PID=$(echo $PPID)
TMP_DIR="/tmp/dynamodb.$PID"
PID_FILE="/tmp/dynamodb.$PID.pid"
DYNAMODB_DIR="$DIR/$NAME"

# create database directory
mkdir ${TMP_DIR}

java -Djava.library.path=${DYNAMODB_DIR}/DynamoDBLocal_lib -jar ${DYNAMODB_DIR}/DynamoDBLocal.jar -inMemory -port 8000 -sharedDb &

echo "Waiting until DynamoDB is ready on port 8000"
while [[ -z `curl -s 'http://127.0.0.1:8000/shell/' ` ]] ; do
  echo -n "."
  sleep 2s
done

echo "DynamoDB is up"
