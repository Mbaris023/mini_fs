CC = gcc
CFLAGS = -Wall -Wextra -g -pthread
INCLUDES = -Iinclude

SRCS = src/main.c src/fs.c src/disk.c src/bitmap.c src/inode.c src/logger.c src/utils.c
OBJS = $(SRCS:.c=.o)
TARGET = mini_fs

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^

%.o: %.c
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -f src/*.o $(TARGET) virtual_disk.bin fs.log
