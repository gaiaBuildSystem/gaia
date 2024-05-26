#!/bin/bash

echo "Building fastfetch..."

cd $BUILD_PATH/tmp/$MACHINE/fastfetch
mkdir -p build
cd build
cmake ..
cmake --build . --target fastfetch
