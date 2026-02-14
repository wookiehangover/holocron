BINARY_NAME = holocron
INSTALL_DIR = /usr/local/bin

.PHONY: build install uninstall clean check

build:
	cargo build --release

install: build
	@cp target/release/$(BINARY_NAME) $(INSTALL_DIR)/$(BINARY_NAME)
	@echo "Installed to $(INSTALL_DIR)/$(BINARY_NAME)"

uninstall:
	@rm -f $(INSTALL_DIR)/$(BINARY_NAME)
	@echo "Removed $(INSTALL_DIR)/$(BINARY_NAME)"

clean:
	cargo clean

# --- Quality ---

check:
	cargo clippy
	cargo test
	@echo "All checks passed."

