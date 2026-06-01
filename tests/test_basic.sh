#!/bin/bash

make clean
make

echo "=== Formating Disk ==="
./mini_fs format 10240 256

echo "=== Creating Files ==="
./mini_fs create test1.txt
./mini_fs create test2.txt

echo "=== Writing to Files ==="
./mini_fs write test1.txt "Hello from file 1!"
./mini_fs write test2.txt "This is the second file content."

echo "=== Listing Files ==="
./mini_fs ls

echo "=== Reading File 1 ==="
./mini_fs read test1.txt

echo "=== statfs ==="
./mini_fs statfs

echo "=== Deleting File 2 ==="
./mini_fs rm test2.txt

echo "=== Listing Files after Delete ==="
./mini_fs ls
