#include "../include/utils.h"

void print_error(const char *msg) {
    fprintf(stderr, "[ERROR] %s\n", msg);
}

void print_success(const char *msg) {
    printf("[SUCCESS] %s\n", msg);
}
