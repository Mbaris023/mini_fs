#include "../include/bitmap.h"
#include "../include/disk.h"
#include "../include/logger.h"

extern Superblock sb;
static uint8_t *bitmap = NULL;

int bitmap_init(void) {
    uint32_t bitmap_bytes = sb.bitmap_blocks * sb.block_size;
    bitmap = (uint8_t *)malloc(bitmap_bytes);
    if (!bitmap) return -1;
    
    // read bitmap blocks from disk
    for (uint32_t i = 0; i < sb.bitmap_blocks; i++) {
        if (disk_read(sb.bitmap_start + i, bitmap + (i * sb.block_size)) < 0) {
            free(bitmap);
            return -1;
        }
    }
    return 0;
}

int bitmap_allocate_block(uint32_t *out_block_num) {
    uint32_t total_bits = sb.total_blocks;
    for (uint32_t i = 0; i < total_bits; i++) {
        uint32_t byte_idx = i / 8;
        uint32_t bit_idx = i % 8;
        if ((bitmap[byte_idx] & (1 << bit_idx)) == 0) {
            // Free block found
            bitmap[byte_idx] |= (1 << bit_idx);
            *out_block_num = i;
            sb.free_blocks--;
            bitmap_sync();
            return 0;
        }
    }
    return -1; // No free blocks
}

int bitmap_free_block(uint32_t block_num) {
    if (block_num >= sb.total_blocks) return -1;
    uint32_t byte_idx = block_num / 8;
    uint32_t bit_idx = block_num % 8;
    
    bitmap[byte_idx] &= ~(1 << bit_idx);
    sb.free_blocks++;
    bitmap_sync();
    return 0;
}

void bitmap_sync(void) {
    if (!bitmap) return;
    for (uint32_t i = 0; i < sb.bitmap_blocks; i++) {
        disk_write(sb.bitmap_start + i, bitmap + (i * sb.block_size));
    }
}
