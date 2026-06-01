#!/bin/bash

make clean
make

echo "=== Formating Disk ==="
./mini_fs format 102400 512

echo "=== Creating Many Files ==="
for i in {1..20}; do
    ./mini_fs create file_$i.txt
done

echo "=== Writing Large Data ==="
LONG_TEXT="This is a long text pattern used to test multiple direct blocks allocation. "
LONG_TEXT="${LONG_TEXT}${LONG_TEXT}${LONG_TEXT}${LONG_TEXT}"
./mini_fs write file_1.txt "$LONG_TEXT"

echo "=== statfs ==="
./mini_fs statfs

echo "=== Reading Large Data ==="
./mini_fs read file_1.txt
