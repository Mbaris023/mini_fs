#ifndef INODE_H
#define INODE_H

#include "common.h"

int inode_init_table(void);
int inode_allocate(Inode *out_inode);
int inode_free(uint32_t id);
int inode_read(uint32_t id, Inode *out_inode);
int inode_write(uint32_t id, const Inode *in_inode);
int inode_find_by_name(const char *name, Inode *out_inode);

#endif // INODE_H
