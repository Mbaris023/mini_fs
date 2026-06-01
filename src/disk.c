#include "../include/disk.h"
#include "../include/logger.h"

static int disk_fd = -1;
static uint32_t disk_block_size = 0;

int disk_init(const char *filename, uint32_t total_size, uint32_t block_size, bool format) {
    int flags = O_RDWR;
    if (format) {
        flags |= O_CREAT | O_TRUNC;
    }
    
    // permissions: 0666
    disk_fd = open(filename, flags, 0666);
    if (disk_fd < 0) {
        perror("open disk");
        return -1;
    }
    
    if (format) {
        // truncate to total_size
        if (ftruncate(disk_fd, total_size) != 0) {
            perror("ftruncate disk");
            close(disk_fd);
            return -1;
        }
    }
    
    disk_block_size = block_size;
    return 0;
}

int disk_read(uint32_t block_num, void *buffer) {
    if (disk_fd < 0) return -1;
    off_t offset = (off_t)block_num * disk_block_size;
    ssize_t ret = pread(disk_fd, buffer, disk_block_size, offset);
    if (ret != disk_block_size) {
        if (ret < 0) perror("disk_read pread");
        else fprintf(stderr, "disk_read: unexpected EOF (block %u)\n", block_num);
        return -1;
    }
    return 0;
}

int disk_write(uint32_t block_num, const void *buffer) {
    if (disk_fd < 0) return -1;
    off_t offset = (off_t)block_num * disk_block_size;
    ssize_t ret = pwrite(disk_fd, buffer, disk_block_size, offset);
    if (ret != disk_block_size) {
        if (ret < 0) perror("disk_write pwrite");
        else fprintf(stderr, "disk_write: unexpected incomplete write (block %u)\n", block_num);
        return -1;
    }
    return 0;
}

void disk_close(void) {
    if (disk_fd >= 0) {
        close(disk_fd);
        disk_fd = -1;
    }
}
