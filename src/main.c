#include "../include/fs.h"
#include "../include/logger.h"
#include "../include/perf.h"
#include "../include/utils.h"

void print_usage(void) {
    printf("Usage:\n");
    printf("  ./mini_fs format   <total_bytes> <block_size>\n");
    printf("  ./mini_fs shell                              (interactive REPL)\n");
    printf("  ./mini_fs create   <filename>\n");
    printf("  ./mini_fs rm       <filename>\n");
    printf("  ./mini_fs write    <filename>  \"<text>\"\n");
    printf("  ./mini_fs append   <filename>  \"<text>\"\n");
    printf("  ./mini_fs read     <filename>\n");
    printf("  ./mini_fs rename   <old>  <new>\n");
    printf("  ./mini_fs cp       <src>  <dst>\n");
    printf("  ./mini_fs stat     <filename>\n");
    printf("  ./mini_fs chmod    <filename>  <octal_mode>\n");
    printf("  ./mini_fs truncate <filename>  <new_size>\n");
    printf("  ./mini_fs ls\n");
    printf("  ./mini_fs statfs\n");
    printf("  ./mini_fs fsck\n");
    printf("  ./mini_fs perf\n");
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        print_usage();
        return 1;
    }

    perf_init();

    /* ---- format (no mount needed) ---- */
    if (strcmp(argv[1], "format") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs format <size> <block_size>\n"); return 1; }
        logger_init();
        int ret = fs_format((uint32_t)atoi(argv[2]), (uint32_t)atoi(argv[3]));
        logger_cleanup();
        return (ret == 0) ? 0 : 1;
    }

    /* ---- shell mode (mount + REPL) ---- */
    if (strcmp(argv[1], "shell") == 0) {
        logger_init();
        if (fs_mount() < 0) {
            fprintf(stderr, "Failed to mount. Did you run 'format'?\n");
            logger_cleanup();
            return 1;
        }
        fs_shell();
        fs_unmount();
        logger_cleanup();
        return 0;
    }

    /* ---- all other commands need a mount ---- */
    logger_init();
    if (fs_mount() < 0) {
        fprintf(stderr, "Failed to mount. Did you run 'format'?\n");
        logger_cleanup();
        return 1;
    }

    int ret = 0;

    if      (strcmp(argv[1], "create") == 0) {
        if (argc != 3) { printf("Usage: ./mini_fs create <filename>\n"); ret = 1; }
        else ret = (fs_create(argv[2]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "rm") == 0) {
        if (argc != 3) { printf("Usage: ./mini_fs rm <filename>\n"); ret = 1; }
        else ret = (fs_delete(argv[2]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "write") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs write <filename> \"<text>\"\n"); ret = 1; }
        else ret = (fs_write(argv[2], argv[3]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "append") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs append <filename> \"<text>\"\n"); ret = 1; }
        else ret = (fs_append(argv[2], argv[3]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "read") == 0) {
        if (argc != 3) { printf("Usage: ./mini_fs read <filename>\n"); ret = 1; }
        else ret = (fs_read(argv[2]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "rename") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs rename <old> <new>\n"); ret = 1; }
        else ret = (fs_rename(argv[2], argv[3]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "cp") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs cp <src> <dst>\n"); ret = 1; }
        else ret = (fs_copy(argv[2], argv[3]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "stat") == 0) {
        if (argc != 3) { printf("Usage: ./mini_fs stat <filename>\n"); ret = 1; }
        else ret = (fs_stat(argv[2]) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "chmod") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs chmod <filename> <mode>\n"); ret = 1; }
        else {
            uint16_t mode = (uint16_t)strtol(argv[3], NULL, 8);
            ret = (fs_chmod(argv[2], mode) == 0) ? 0 : 1;
        }
    }
    else if (strcmp(argv[1], "truncate") == 0) {
        if (argc != 4) { printf("Usage: ./mini_fs truncate <filename> <size>\n"); ret = 1; }
        else ret = (fs_truncate_file(argv[2], (uint32_t)atoi(argv[3])) == 0) ? 0 : 1;
    }
    else if (strcmp(argv[1], "ls")     == 0) { fs_ls(); }
    else if (strcmp(argv[1], "statfs") == 0) { fs_statfs(); }
    else if (strcmp(argv[1], "fsck")   == 0) { ret = (fs_fsck() == 0) ? 0 : 1; }
    else if (strcmp(argv[1], "perf")   == 0) { fs_perf(); }
    else {
        printf("Unknown command: '%s'\n", argv[1]);
        print_usage();
        ret = 1;
    }

    fs_unmount();
    logger_cleanup();
    return ret;
}
