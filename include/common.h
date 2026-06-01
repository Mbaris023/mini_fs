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
#include <time.h>

#define MAX_FILENAME_LEN  32
#define MAX_DIRECT_BLOCKS 16
#define DISK_FILE         "virtual_disk.bin"
#define LOG_FILE          "fs.log"

/* Magic number: ASCII "MINI" */
#define FS_MAGIC 0x4D494E49

/* File type flags (stored in Inode.mode high bits) */
#define FS_IFREG  0x8000   /* regular file */
#define FS_IFDIR  0x4000   /* directory (future use) */

/* Default permission bits */
#define FS_DEFAULT_MODE 0644

/* ------------------------------------------------------------------ */
/*  Superblock — block 0 of the disk                                   */
/* ------------------------------------------------------------------ */
typedef struct {
    uint32_t magic;
    uint32_t total_blocks;
    uint32_t block_size;
    uint32_t max_inodes;
    uint32_t free_blocks;
    uint32_t free_inodes;

    /* Layout (all in block numbers) */
    uint32_t bitmap_start;
    uint32_t bitmap_blocks;
    uint32_t inode_start;
    uint32_t inode_blocks;
    uint32_t data_start;
    uint32_t data_blocks;

    /* Filesystem-level statistics */
    uint64_t total_writes;   /* cumulative write ops */
    uint64_t total_reads;    /* cumulative read ops */
    uint64_t bytes_written;  /* cumulative bytes written */
    uint64_t bytes_read;     /* cumulative bytes read */
    time_t   formatted_at;   /* Unix timestamp of last format */
} Superblock;

/* ------------------------------------------------------------------ */
/*  Inode                                                               */
/* ------------------------------------------------------------------ */
typedef struct {
    uint32_t id;
    uint32_t size;           /* file size in bytes */
    uint8_t  is_used;        /* 0 = free, 1 = used */
    uint16_t mode;           /* permission bits (e.g. 0644) + type flags */
    char     name[MAX_FILENAME_LEN];
    uint32_t direct_blocks[MAX_DIRECT_BLOCKS];
    time_t   created_at;     /* creation timestamp */
    time_t   modified_at;    /* last modification timestamp */
    time_t   accessed_at;    /* last access timestamp */
    uint32_t link_count;     /* hard link count (currently always 1) */
    uint8_t  _pad[3];        /* alignment padding */
} Inode;

#endif /* COMMON_H */
