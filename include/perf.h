#ifndef PERF_H
#define PERF_H

#include <stdint.h>
#include <time.h>

/* Per-operation performance record */
typedef struct {
    char     op_name[32];
    uint64_t duration_ns;   /* nanoseconds */
    uint64_t bytes_io;      /* bytes involved */
} PerfRecord;

#define PERF_HISTORY 64

typedef struct {
    PerfRecord records[PERF_HISTORY];
    int        count;
    int        head;           /* ring-buffer head */

    /* Running totals */
    uint64_t total_ops;
    uint64_t total_ns;
    uint64_t total_bytes;
} PerfStats;

void     perf_init(void);
uint64_t perf_now_ns(void);           /* monotonic nanoseconds */
void     perf_record(const char *op, uint64_t start_ns, uint64_t bytes);
void     perf_report(void);           /* print summary */
void     perf_last(char *buf, size_t len); /* "op: X.XXX ms" */

#endif /* PERF_H */
