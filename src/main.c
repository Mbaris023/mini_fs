#include "../include/fs.h"
#include "../include/logger.h"
#include "../include/utils.h"

void print_usage() {
    printf("Usage:\n");
    printf("  ./mini_fs format <size> <block_size>\n");
    printf("  ./mini_fs create <filename>\n");
    printf("  ./mini_fs rm <filename>\n");
    printf("  ./mini_fs write <filename> \"<text>\"\n");
    printf("  ./mini_fs read <filename>\n");
    printf("  ./mini_fs ls\n");
    printf("  ./mini_fs statfs\n");
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        print_usage();
        return 1;
    }
    
    if (strcmp(argv[1], "format") == 0) {
        if (argc != 4) {
            printf("Usage: ./mini_fs format <size> <block_size>\n");
            return 1;
        }
        logger_init();
        fs_format(atoi(argv[2]), atoi(argv[3]));
        logger_cleanup();
        return 0;
    }
    
    logger_init();
    
    if (fs_mount() < 0) {
        fprintf(stderr, "Failed to mount. Did you format?\n");
        logger_cleanup();
        return 1;
    }
    
    if (strcmp(argv[1], "create") == 0) {
        if (argc != 3) printf("Usage: ./mini_fs create <filename>\n");
        else fs_create(argv[2]);
    }
    else if (strcmp(argv[1], "rm") == 0) {
        if (argc != 3) printf("Usage: ./mini_fs rm <filename>\n");
        else fs_delete(argv[2]);
    }
    else if (strcmp(argv[1], "write") == 0) {
        if (argc != 4) printf("Usage: ./mini_fs write <filename> \"<text>\"\n");
        else fs_write(argv[2], argv[3]);
    }
    else if (strcmp(argv[1], "read") == 0) {
        if (argc != 3) printf("Usage: ./mini_fs read <filename>\n");
        else fs_read(argv[2]);
    }
    else if (strcmp(argv[1], "ls") == 0) {
        fs_ls();
    }
    else if (strcmp(argv[1], "statfs") == 0) {
        fs_statfs();
    }
    else {
        printf("Unknown command: %s\n", argv[1]);
        print_usage();
    }
    
    fs_unmount();
    logger_cleanup();
    
    return 0;
}
