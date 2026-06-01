#!/usr/bin/env bash
# =============================================================================
#  mini_fs — Automated Test Suite
#  Usage: make test   OR   bash tests/test_suite.sh
# =============================================================================

set -uo pipefail

BIN="./mini_fs"
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

pass() { echo -e "  ${GREEN}[PASS]${RESET} $1"; PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
fail() { echo -e "  ${RED}[FAIL]${RESET} $1"; FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); }
section() { echo -e "\n${CYAN}=== $1 ===${RESET}"; }

# Clean state
rm -f virtual_disk.bin fs.log

section "1. Format"
$BIN format 1048576 512 > /dev/null 2>&1 && pass "format 1MB/512B" || fail "format 1MB/512B"
$BIN format 4194304 1024 > /dev/null 2>&1 && pass "format 4MB/1KB" || fail "format 4MB/1KB"

section "2. Create"
$BIN format 1048576 512 > /dev/null
$BIN create hello.txt  > /dev/null && pass "create hello.txt"  || fail "create hello.txt"
$BIN create world.txt  > /dev/null && pass "create world.txt"  || fail "create world.txt"
$BIN create readme.md  > /dev/null && pass "create readme.md"  || fail "create readme.md"
# Duplicate create should fail
$BIN create hello.txt > /dev/null 2>&1 && fail "duplicate create should fail" || pass "duplicate create rejected"

section "3. Write & Read"
$BIN write hello.txt "Merhaba Dunya!" > /dev/null && pass "write hello.txt" || fail "write hello.txt"
OUTPUT=$($BIN read hello.txt 2>&1)
[[ "$OUTPUT" == "Merhaba Dunya!" ]] && pass "read hello.txt content" || fail "read hello.txt (got: '$OUTPUT')"

$BIN write world.txt "Sistem Programlama 2026" > /dev/null
OUTPUT=$($BIN read world.txt 2>&1)
[[ "$OUTPUT" == "Sistem Programlama 2026" ]] && pass "read world.txt content" || fail "read world.txt"

section "4. Append"
$BIN append hello.txt " - Append!" > /dev/null && pass "append hello.txt" || fail "append hello.txt"
OUTPUT=$($BIN read hello.txt 2>&1)
[[ "$OUTPUT" == "Merhaba Dunya! - Append!" ]] && pass "read after append" || fail "read after append (got: '$OUTPUT')"

section "5. Stat"
OUTPUT=$($BIN stat hello.txt 2>&1)
echo "$OUTPUT" | grep -q "hello.txt" && pass "stat shows filename" || fail "stat missing filename"
echo "$OUTPUT" | grep -q "Inode"     && pass "stat shows inode"    || fail "stat missing inode"
echo "$OUTPUT" | grep -q "Mode"      && pass "stat shows mode"     || fail "stat missing mode"
echo "$OUTPUT" | grep -q "Created"   && pass "stat shows created"  || fail "stat missing created"

section "6. Rename"
$BIN rename hello.txt greetings.txt > /dev/null && pass "rename hello.txt -> greetings.txt" || fail "rename"
$BIN read greetings.txt > /dev/null 2>&1         && pass "renamed file is readable"         || fail "renamed file not readable"
$BIN read hello.txt     > /dev/null 2>&1         && fail "old name should not exist"        || pass "old name gone after rename"

section "7. Copy"
$BIN cp greetings.txt copy_of_greetings.txt > /dev/null && pass "cp greetings.txt" || fail "cp"
OUTPUT=$($BIN read copy_of_greetings.txt 2>&1)
[[ "$OUTPUT" == "Merhaba Dunya! - Append!" ]] && pass "copy content matches" || fail "copy content mismatch"

section "8. chmod"
$BIN chmod greetings.txt 0600 > /dev/null && pass "chmod 0600" || fail "chmod"
OUTPUT=$($BIN stat greetings.txt 2>&1)
echo "$OUTPUT" | grep -q "0600" && pass "chmod mode stored correctly" || fail "chmod mode not stored"

section "9. Truncate"
$BIN truncate greetings.txt 7 > /dev/null && pass "truncate to 7 bytes" || fail "truncate"
OUTPUT=$($BIN read greetings.txt 2>&1)
[[ ${#OUTPUT} -le 7 ]] && pass "truncated content length ok" || fail "truncate content too long (${#OUTPUT})"

section "10. ls"
OUTPUT=$($BIN ls 2>&1)
echo "$OUTPUT" | grep -q "world.txt"   && pass "ls shows world.txt"   || fail "ls missing world.txt"
echo "$OUTPUT" | grep -q "readme.md"   && pass "ls shows readme.md"   || fail "ls missing readme.md"

section "11. Delete"
$BIN rm world.txt > /dev/null && pass "rm world.txt" || fail "rm world.txt"
$BIN read world.txt > /dev/null 2>&1 && fail "deleted file should not be readable" || pass "deleted file gone"
$BIN rm nonexistent.txt > /dev/null 2>&1 && fail "rm nonexistent should fail" || pass "rm nonexistent rejected"

section "12. statfs"
OUTPUT=$($BIN statfs 2>&1)
echo "$OUTPUT" | grep -q "Magic"       && pass "statfs shows Magic"      || fail "statfs missing Magic"
echo "$OUTPUT" | grep -q "Block size"  && pass "statfs shows Block size"  || fail "statfs missing Block size"
echo "$OUTPUT" | grep -q "I/O"         && pass "statfs shows I/O stats"   || fail "statfs missing I/O stats"

section "13. fsck"
# Run fsck on a fresh filesystem for clean check
$BIN format 1048576 512 > /dev/null 2>&1
$BIN create fsck_a.txt > /dev/null 2>&1
$BIN write fsck_a.txt "test content for fsck" > /dev/null 2>&1
$BIN create fsck_b.txt > /dev/null 2>&1
OUTPUT=$($BIN fsck 2>&1)
echo "$OUTPUT" | grep -q "CLEAN\|0 error" && pass "fsck passes on healthy fs" || fail "fsck found unexpected errors"
echo "$OUTPUT" | grep -q "OK.*Magic"      && pass "fsck: magic OK"             || fail "fsck: magic check missing"

section "14. Performance"
$BIN perf > /dev/null 2>&1 && pass "perf command runs" || fail "perf command failed"

# ---- Summary ----
echo ""
echo "========================================"
echo -e "  Results: ${GREEN}${PASS} passed${RESET}  /  ${RED}${FAIL} failed${RESET}  /  ${TOTAL} total"
echo "========================================"

rm -f virtual_disk.bin fs.log
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
