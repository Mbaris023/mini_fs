#include "../include/logger.h"
#include <stdarg.h>
#include <time.h>

pthread_mutex_t log_mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t log_cond = PTHREAD_COND_INITIALIZER;
pthread_mutex_t fs_mutex = PTHREAD_MUTEX_INITIALIZER;

#define MAX_LOGS 1024
#define LOG_MSG_LEN 256

static char log_queue[MAX_LOGS][LOG_MSG_LEN];
static int log_head = 0;
static int log_tail = 0;
static int log_count = 0;
static bool stop_logger = false;
static pthread_t logger_thread_id;
static FILE *log_file = NULL;

static void* logger_thread_func(void* arg __attribute__((unused))) {
    log_file = fopen(LOG_FILE, "a");
    if (!log_file) return NULL;
    
    while (1) {
        pthread_mutex_lock(&log_mutex);
        while (log_count == 0 && !stop_logger) {
            pthread_cond_wait(&log_cond, &log_mutex);
        }
        
        if (stop_logger && log_count == 0) {
            pthread_mutex_unlock(&log_mutex);
            break;
        }
        
        // Write all pending logs
        while (log_count > 0) {
            fprintf(log_file, "%s", log_queue[log_tail]);
            fflush(log_file);
            log_tail = (log_tail + 1) % MAX_LOGS;
            log_count--;
        }
        pthread_mutex_unlock(&log_mutex);
    }
    
    fclose(log_file);
    return NULL;
}

int logger_init(void) {
    stop_logger = false;
    log_head = 0;
    log_tail = 0;
    log_count = 0;
    if (pthread_create(&logger_thread_id, NULL, logger_thread_func, NULL) != 0) {
        perror("pthread_create logger");
        return -1;
    }
    return 0;
}

void logger_cleanup(void) {
    pthread_mutex_lock(&log_mutex);
    stop_logger = true;
    pthread_cond_signal(&log_cond);
    pthread_mutex_unlock(&log_mutex);
    
    pthread_join(logger_thread_id, NULL);
}

void fs_log(const char *format, ...) {
    char time_buf[64];
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", t);
    
    char msg_buf[LOG_MSG_LEN];
    int offset = snprintf(msg_buf, LOG_MSG_LEN, "[%s] ", time_buf);
    
    va_list args;
    va_start(args, format);
    vsnprintf(msg_buf + offset, LOG_MSG_LEN - offset, format, args);
    va_end(args);
    
    // Add newline if missing
    if (msg_buf[strlen(msg_buf) - 1] != '\n') {
        strncat(msg_buf, "\n", LOG_MSG_LEN - strlen(msg_buf) - 1);
    }
    
    pthread_mutex_lock(&log_mutex);
    if (log_count < MAX_LOGS) {
        strncpy(log_queue[log_head], msg_buf, LOG_MSG_LEN);
        log_head = (log_head + 1) % MAX_LOGS;
        log_count++;
        pthread_cond_signal(&log_cond);
    } else {
        // Drop log or handle full queue
        fprintf(stderr, "Log queue full, dropping log: %s", msg_buf);
    }
    pthread_mutex_unlock(&log_mutex);
}
