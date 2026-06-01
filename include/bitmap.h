#ifndef BITMAP_H
#define BITMAP_H

#include "common.h"

int bitmap_init();
int bitmap_allocate_block(uint32_t *out_block_num);
int bitmap_free_block(uint32_t block_num);
void bitmap_sync(); // writes back to disk

#endif // BITMAP_H
