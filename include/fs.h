#ifndef FS_H
#define FS_H

#include "common.h"

/* Mount / format */
int  fs_format(uint32_t total_size, uint32_t block_size);
int  fs_mount(void);
void fs_unmount(void);

/* Core file operations */
int  fs_create(const char *name);
int  fs_delete(const char *name);
int  fs_write(const char *name, const char *data);
int  fs_append(const char *name, const char *data);
int  fs_read(const char *name);
int  fs_rename(const char *old_name, const char *new_name);
int  fs_copy(const char *src, const char *dst);
int  fs_truncate_file(const char *name, uint32_t new_size);
int  fs_chmod(const char *name, uint16_t mode);

/* Directory / metadata */
int  fs_ls(void);
int  fs_stat(const char *name);
int  fs_statfs(void);

/* Maintenance */
int  fs_fsck(void);        /* filesystem consistency check */
void fs_perf(void);        /* print performance report */

/* Interactive shell */
void fs_shell(void);

#endif /* FS_H */
