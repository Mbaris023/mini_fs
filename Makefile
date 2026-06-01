CC      = gcc
CFLAGS  = -Wall -Wextra -Wpedantic -g -O2 -pthread
INCLUDES = -Iinclude

SRCS = src/main.c src/fs.c src/disk.c src/bitmap.c \
       src/inode.c src/logger.c src/utils.c src/perf.c

OBJS   = $(SRCS:.c=.o)
TARGET = mini_fs

.PHONY: all clean test valgrind

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^
	@echo "Build OK: $(TARGET)"

%.o: %.c
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -f src/*.o $(TARGET) virtual_disk.bin fs.log

test: $(TARGET)
	@echo "Running test suite..."
	@bash tests/test_suite.sh

valgrind: $(TARGET)
	@echo "Running valgrind memory check..."
	valgrind --leak-check=full --error-exitcode=1 \
	    ./$(TARGET) format 1048576 512
	valgrind --leak-check=full --error-exitcode=1 \
	    ./$(TARGET) create valgrind_test.txt
	valgrind --leak-check=full --error-exitcode=1 \
	    ./$(TARGET) write valgrind_test.txt "valgrind memory check"
	valgrind --leak-check=full --error-exitcode=1 \
	    ./$(TARGET) read valgrind_test.txt
	valgrind --leak-check=full --error-exitcode=1 \
	    ./$(TARGET) rm valgrind_test.txt
	@echo "Valgrind checks passed."
