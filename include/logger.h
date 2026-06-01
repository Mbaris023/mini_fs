#ifndef LOGGER_H
#define LOGGER_H

#include "common.h"

// External synchronization variables defined in logger.c
extern pthread_mutex_t log_mutex;
extern pthread_cond_t log_cond;
extern pthread_mutex_t fs_mutex;

int logger_init();
void logger_cleanup();
void fs_log(const char *format, ...);

#endif // LOGGER_H
