#include "../include/fs.h"
#include "../include/disk.h"
#include "../include/bitmap.h"
#include "../include/inode.h"
#include "../include/logger.h"

Superblock sb;

int fs_format(uint32_t total_size, uint32_t block_size) {
    pthread_mutex_lock(&fs_mutex);
    
    if (disk_init(DISK_FILE, total_size, block_size, true) < 0) {
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    uint32_t total_blocks = total_size / block_size;
    
    uint32_t bitmap_blocks = (total_blocks + (block_size * 8) - 1) / (block_size * 8);
    uint32_t inode_blocks = total_blocks / 10; 
    if (inode_blocks == 0) inode_blocks = 1;
    
    if (1 + bitmap_blocks + inode_blocks >= total_blocks) {
        fprintf(stderr, "Error: Disk size (%u blocks) is too small to format.\n", total_blocks);
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    uint32_t max_inodes = (inode_blocks * block_size) / sizeof(Inode);
    if (max_inodes == 0) {
        fprintf(stderr, "Error: Block size too small to fit an inode.\n");
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    sb.magic = FS_MAGIC;
    sb.total_blocks = total_blocks;
    sb.block_size = block_size;
    sb.max_inodes = max_inodes;
    
    sb.bitmap_start = 1;
    sb.bitmap_blocks = bitmap_blocks;
    
    sb.inode_start = sb.bitmap_start + sb.bitmap_blocks;
    sb.inode_blocks = inode_blocks;
    
    sb.data_start = sb.inode_start + sb.inode_blocks;
    sb.data_blocks = total_blocks - sb.data_start;
    
    sb.free_blocks = sb.data_blocks;
    sb.free_inodes = max_inodes;
    
    disk_write(0, &sb);
    
    uint8_t *zero_buf = (uint8_t*)calloc(1, block_size);
    for (uint32_t i = 0; i < bitmap_blocks; i++) {
        disk_write(sb.bitmap_start + i, zero_buf);
    }
    
    for (uint32_t i = 0; i < inode_blocks; i++) {
        disk_write(sb.inode_start + i, zero_buf);
    }
    free(zero_buf);
    
    bitmap_init();
    for (uint32_t i = 0; i < sb.data_start; i++) {
        uint32_t dummy;
        bitmap_allocate_block(&dummy); // Mark metadata blocks as used
    }
    
    fs_log("Formatted disk: size=%u, block_size=%u", total_size, block_size);
    disk_close();
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

int fs_mount() {
    pthread_mutex_lock(&fs_mutex);
    if (disk_init(DISK_FILE, 0, 0, false) < 0) {
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    uint8_t buf[1024];
    int temp_fd = open(DISK_FILE, O_RDONLY);
    if (temp_fd < 0) {
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    pread(temp_fd, buf, sizeof(Superblock), 0);
    close(temp_fd);
    memcpy(&sb, buf, sizeof(Superblock));
    
    if (sb.magic != FS_MAGIC) {
        fprintf(stderr, "Invalid magic number!\n");
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    disk_init(DISK_FILE, sb.total_blocks * sb.block_size, sb.block_size, false);
    
    bitmap_init();
    inode_init_table();
    
    fs_log("Mounted disk: free_blocks=%u, free_inodes=%u", sb.free_blocks, sb.free_inodes);
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

void fs_unmount() {
    pthread_mutex_lock(&fs_mutex);
    bitmap_sync();
    disk_write(0, &sb);
    disk_close();
    fs_log("Unmounted disk.");
    pthread_mutex_unlock(&fs_mutex);
}

int fs_create(const char *name) {
    pthread_mutex_lock(&fs_mutex);
    
    Inode existing;
    if (inode_find_by_name(name, &existing) == 0) {
        fprintf(stderr, "File '%s' already exists.\n", name);
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    Inode new_inode;
    if (inode_allocate(&new_inode) < 0) {
        fprintf(stderr, "No free inodes.\n");
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    strncpy(new_inode.name, name, MAX_FILENAME_LEN - 1);
    new_inode.size = 0;
    inode_write(new_inode.id, &new_inode);
    disk_write(0, &sb);
    
    fs_log("Created file '%s' (inode %u)", name, new_inode.id);
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

int fs_delete(const char *name) {
    pthread_mutex_lock(&fs_mutex);
    
    Inode inode;
    if (inode_find_by_name(name, &inode) < 0) {
        fprintf(stderr, "File '%s' not found.\n", name);
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    uint32_t blocks_used = (inode.size + sb.block_size - 1) / sb.block_size;
    for (uint32_t i = 0; i < blocks_used; i++) {
        bitmap_free_block(inode.direct_blocks[i]);
    }
    
    inode_free(inode.id);
    disk_write(0, &sb);
    
    fs_log("Deleted file '%s' (inode %u)", name, inode.id);
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

int fs_write(const char *name, const char *data) {
    pthread_mutex_lock(&fs_mutex);
    
    Inode inode;
    if (inode_find_by_name(name, &inode) < 0) {
        fprintf(stderr, "File '%s' not found.\n", name);
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    uint32_t data_len = strlen(data);
    uint32_t blocks_needed = (data_len + sb.block_size - 1) / sb.block_size;
    if (blocks_needed == 0) blocks_needed = 1;
    
    if (blocks_needed > MAX_DIRECT_BLOCKS) {
        fprintf(stderr, "File too large (exceeds direct blocks).\n");
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    uint32_t old_blocks = (inode.size > 0) ? ((inode.size + sb.block_size - 1) / sb.block_size) : 0;
    for (uint32_t i = 0; i < old_blocks; i++) {
        bitmap_free_block(inode.direct_blocks[i]);
    }
    
    uint32_t bytes_written = 0;
    for (uint32_t i = 0; i < blocks_needed; i++) {
        uint32_t block_num;
        if (bitmap_allocate_block(&block_num) < 0) {
            fprintf(stderr, "Disk full.\n");
            pthread_mutex_unlock(&fs_mutex);
            return -1;
        }
        inode.direct_blocks[i] = block_num;
        
        uint32_t write_len = data_len - bytes_written;
        if (write_len > sb.block_size) write_len = sb.block_size;
        
        uint8_t *buf = (uint8_t*)calloc(1, sb.block_size);
        memcpy(buf, data + bytes_written, write_len);
        disk_write(block_num, buf);
        free(buf);
        
        bytes_written += write_len;
    }
    
    inode.size = data_len;
    inode_write(inode.id, &inode);
    disk_write(0, &sb);
    
    fs_log("Wrote %u bytes to '%s'", data_len, name);
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

int fs_read(const char *name) {
    pthread_mutex_lock(&fs_mutex);
    
    Inode inode;
    if (inode_find_by_name(name, &inode) < 0) {
        fprintf(stderr, "File '%s' not found.\n", name);
        pthread_mutex_unlock(&fs_mutex);
        return -1;
    }
    
    if (inode.size == 0) {
        printf("\n");
        fs_log("Read empty file '%s'", name);
        pthread_mutex_unlock(&fs_mutex);
        return 0;
    }
    
    uint32_t blocks_used = (inode.size + sb.block_size - 1) / sb.block_size;
    uint32_t bytes_read = 0;
    
    for (uint32_t i = 0; i < blocks_used; i++) {
        uint8_t *buf = (uint8_t*)malloc(sb.block_size);
        disk_read(inode.direct_blocks[i], buf);
        
        uint32_t read_len = inode.size - bytes_read;
        if (read_len > sb.block_size) read_len = sb.block_size;
        
        fwrite(buf, 1, read_len, stdout);
        bytes_read += read_len;
        free(buf);
    }
    printf("\n");
    
    fs_log("Read %u bytes from '%s'", inode.size, name);
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

int fs_ls() {
    pthread_mutex_lock(&fs_mutex);
    
    printf("Listing files:\n");
    for (uint32_t i = 0; i < sb.max_inodes; i++) {
        Inode temp;
        if (inode_read(i, &temp) == 0 && temp.is_used == 1) {
            printf("- %s (Size: %u bytes, Inode: %u)\n", temp.name, temp.size, temp.id);
        }
    }
    
    fs_log("Listed files.");
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}

int fs_statfs() {
    pthread_mutex_lock(&fs_mutex);
    
    printf("File System Status:\n");
    printf("  Magic: 0x%X\n", sb.magic);
    printf("  Block Size: %u bytes\n", sb.block_size);
    printf("  Total Blocks: %u\n", sb.total_blocks);
    printf("  Free Blocks: %u\n", sb.free_blocks);
    printf("  Max Inodes: %u\n", sb.max_inodes);
    printf("  Free Inodes: %u\n", sb.free_inodes);
    printf("  Bitmap Blocks: %u\n", sb.bitmap_blocks);
    printf("  Inode Blocks: %u\n", sb.inode_blocks);
    printf("  Data Blocks Start: %u\n", sb.data_start);
    
    fs_log("Checked statfs.");
    
    pthread_mutex_unlock(&fs_mutex);
    return 0;
}
