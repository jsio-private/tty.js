#!/bin/bash

SRC_DIR=$RECIPE_DIR/..
cd $SRC_DIR

npm --loglevel warn install -g 

POST_LINK=$PREFIX/bin/.${PKG_NAME}-post-link.sh
cp $RECIPE_DIR/post-link.sh $POST_LINK
chmod +x $POST_LINK

mkdir -p $PREFIX/etc/wakari/apps
cp $SRC_DIR/terminal.json $PREFIX/etc/wakari/apps/terminal.json.template

