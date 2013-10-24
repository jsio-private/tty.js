#!/bin/bash

#possibly need full npm path?
`which npm` --loglevel warn install -g $SRC_DIR

if [ `uname` == Darwin ]
then
    POST_LINK=$PREFIX/bin/.tty.js-post-link.sh
    rm $PREFIX/bin/tty.js
    cp $RECIPE_DIR/post-link.sh $POST_LINK
    chmod +x $POST_LINK
fi
