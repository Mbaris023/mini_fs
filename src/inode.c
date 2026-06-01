#include "../include/inode.h"
#include "../include/disk.h"
#include "../include/logger.h"

extern Superblock sb;

int inode_init_table() {
    return 0; 
}

int inode_read(uint32_t id, Inode *out_inode) {
    if (id >= sb.max_inodes) return -1;
    
    uint32_t inodes_per_block = sb.block_size / sizeof(Inode);
    uint32_t block_num = sb.inode_start + (id / inodes_per_block);
    uint32_t offset_in_block = (id % inodes_per_block) * sizeof(Inode);
    
    uint8_t *buf = (uint8_t*)malloc(sb.block_size);
    if (disk_read(block_num, buf) < 0) {
        free(buf);
        return -1;
    }
    
    memcpy(out_inode, buf + offset_in_block, sizeof(Inode));
    free(buf);
    return 0;
}

int inode_write(uint32_t id, const Inode *in_inode) {
    if (id >= sb.max_inodes) return -1;
    
    uint32_t inodes_per_block = sb.block_size / sizeof(Inode);
    uint32_t block_num = sb.inode_start + (id / inodes_per_block);
    uint32_t offset_in_block = (id % inodes_per_block) * sizeof(Inode);
    
    uint8_t *buf = (uint8_t*)malloc(sb.block_size);
    if (disk_read(block_num, buf) < 0) {
        free(buf);
        return -1;
    }
    
    memcpy(buf + offset_in_block, in_inode, sizeof(Inode));
    if (disk_write(block_num, buf) < 0) {
        free(buf);
        return -1;
    }
    free(buf);
    return 0;
}

int inode_allocate(Inode *out_inode) {
    for (uint32_t i = 0; i < sb.max_inodes; i++) {
        Inode temp;
        if (inode_read(i, &temp) == 0 && temp.is_used == 0) {
            memset(&temp, 0, sizeof(Inode));
            temp.id = i;
            temp.is_used = 1;
            *out_inode = temp;
            sb.free_inodes--;
            inode_write(i, out_inode);
            return 0; // Success
        }
    }
    return -1; // No free inode
}

int inode_free(uint32_t id) {
    Inode temp;
    if (inode_read(id, &temp) < 0) return -1;
    temp.is_used = 0;
    sb.free_inodes++;
    return inode_write(id, &temp);
}

int inode_find_by_name(const char *name, Inode *out_inode) {
    for (uint32_t i = 0; i < sb.max_inodes; i++) {
        Inode temp;
        if (inode_read(i, &temp) == 0 && temp.is_used == 1) {
            if (strcmp(temp.name, name) == 0) {
                *out_inode = temp;
                return 0; // Found
            }
        }
    }
    return -1; // Not found
}
