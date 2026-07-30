TARGET = BIOS
CONFIG = BIOS

.PHONY: all clean test test-one

all: build

build: $(TARGET).asm
	cl65 -g -t none -C $(CONFIG).cfg -l $(TARGET).lst \
	     -Wl --dbgfile,$(TARGET).dbg -o $(TARGET).bin $(TARGET).asm

view:
	hexdump -C $(TARGET).bin

eeprom:
	minipro -p AT28C256	-w $(TARGET).bin

test: build
	tests/run.mjs

test-one: build
	tests/run.mjs --filter "$(T)"

clean:
	rm $(TARGET).bin
	rm $(TARGET).lst
	rm -f $(TARGET).dbg
