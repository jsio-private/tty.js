#!/bin/bash

SRC_DIR=$RECIPE_DIR/..
cd $SRC_DIR

npm --loglevel warn install -g 

if [ `uname` == Darwin ]
then
    POST_LINK=$PREFIX/bin/.tty.js-post-link.sh
    rm $PREFIX/bin/tty.js
    cp $RECIPE_DIR/post-link.sh $POST_LINK
    chmod +x $POST_LINK
fi
