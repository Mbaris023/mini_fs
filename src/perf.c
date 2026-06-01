#include "../include/perf.h"
#include <stdio.h>
#include <string.h>

static PerfStats g_perf;

void perf_init(void) {
    memset(&g_perf, 0, sizeof(g_perf));
}

uint64_t perf_now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
}

void perf_record(const char *op, uint64_t start_ns, uint64_t bytes) {
    uint64_t end_ns  = perf_now_ns();
    uint64_t dur     = end_ns - start_ns;

    PerfRecord *r    = &g_perf.records[g_perf.head % PERF_HISTORY];
    strncpy(r->op_name, op, sizeof(r->op_name) - 1);
    r->duration_ns   = dur;
    r->bytes_io      = bytes;

    g_perf.head      = (g_perf.head + 1) % PERF_HISTORY;
    if (g_perf.count < PERF_HISTORY) g_perf.count++;

    g_perf.total_ops++;
    g_perf.total_ns   += dur;
    g_perf.total_bytes += bytes;
}

void perf_report(void) {
    printf("=== Performance Report ===\n");
    printf("  Total operations : %llu\n",  (unsigned long long)g_perf.total_ops);
    printf("  Total I/O bytes  : %llu\n",  (unsigned long long)g_perf.total_bytes);
    if (g_perf.total_ops > 0) {
        double avg_us = (double)g_perf.total_ns / (double)g_perf.total_ops / 1000.0;
        printf("  Avg latency      : %.3f µs\n", avg_us);
    }
    printf("\n  Last %d operations:\n", g_perf.count);
    int start = (g_perf.head - g_perf.count + PERF_HISTORY) % PERF_HISTORY;
    for (int i = 0; i < g_perf.count; i++) {
        PerfRecord *r = &g_perf.records[(start + i) % PERF_HISTORY];
        printf("  [%02d] %-16s  %8.3f µs  %6llu bytes\n",
               i + 1,
               r->op_name,
               (double)r->duration_ns / 1000.0,
               (unsigned long long)r->bytes_io);
    }
}

void perf_last(char *buf, size_t len) {
    if (g_perf.count == 0) {
        snprintf(buf, len, "(no ops)");
        return;
    }
    int idx = (g_perf.head - 1 + PERF_HISTORY) % PERF_HISTORY;
    PerfRecord *r = &g_perf.records[idx];
    snprintf(buf, len, "%s: %.3f µs", r->op_name, (double)r->duration_ns / 1000.0);
}
