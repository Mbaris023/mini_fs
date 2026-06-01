#ifndef FS_H
#define FS_H

#include "common.h"

// Initialize/Mount/Format
int fs_format(uint32_t total_size, uint32_t block_size);
int fs_mount();
void fs_unmount();

// File operations
int fs_create(const char *name);
int fs_delete(const char *name);
int fs_write(const char *name, const char *data);
int fs_read(const char *name);
int fs_ls();
int fs_statfs();

#endif // FS_H
