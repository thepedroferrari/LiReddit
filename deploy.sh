#!/bin/bash
echo What should the version be?
read VERSION
echo $VERSION

docker build -t thepedroferrari/lireddit:$VERSION .
docker push thepedroferrari/lireddit:$VERSION
