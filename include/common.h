#ifndef COMMON_H
#define COMMON_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <pthread.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <errno.h>

#define MAX_FILENAME_LEN 32
#define MAX_DIRECT_BLOCKS 16
#define DISK_FILE "virtual_disk.bin"
#define LOG_FILE "fs.log"

// Constants
#define FS_MAGIC 0x4D494E49 // 'MINI'

// Data structures
typedef struct {
    uint32_t magic;
    uint32_t total_blocks;
    uint32_t block_size;
    uint32_t max_inodes;
    uint32_t free_blocks;
    uint32_t free_inodes;
    
    // Layout information (block indices)
    uint32_t bitmap_start;
    uint32_t bitmap_blocks;
    uint32_t inode_start;
    uint32_t inode_blocks;
    uint32_t data_start;
    uint32_t data_blocks;
} Superblock;

typedef struct {
    uint32_t id;
    uint32_t size;
    uint8_t is_used; // 0 if free, 1 if used
    char name[MAX_FILENAME_LEN];
    uint32_t direct_blocks[MAX_DIRECT_BLOCKS];
} Inode;

#endif // COMMON_H
