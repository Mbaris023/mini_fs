#ifndef DISK_H
#define DISK_H

#include "common.h"

int disk_init(const char *filename, uint32_t total_size, uint32_t block_size, bool format);
int disk_read(uint32_t block_num, void *buffer);
int disk_write(uint32_t block_num, const void *buffer);
void disk_close();

#endif // DISK_H
