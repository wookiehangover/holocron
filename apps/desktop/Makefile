BINARY_NAME = Holocron
APP_NAME = Holocron.app
APP_DIR = .build/$(APP_NAME)
INSTALL_DIR = /Applications

.PHONY: build bundle run install uninstall clean test format lint check

build:
	swift build -c release

bundle: build
	@rm -rf "$(APP_DIR)"
	@mkdir -p "$(APP_DIR)/Contents/MacOS"
	@cp .build/release/$(BINARY_NAME) "$(APP_DIR)/Contents/MacOS/$(BINARY_NAME)"
	@cp Sources/Holocron/Info.plist "$(APP_DIR)/Contents/Info.plist"
	@echo "Assembled $(APP_DIR)"

run: bundle
	@open "$(APP_DIR)"

install: bundle
	@rm -rf "$(INSTALL_DIR)/$(APP_NAME)"
	@cp -R "$(APP_DIR)" "$(INSTALL_DIR)/$(APP_NAME)"
	@echo "Installed to $(INSTALL_DIR)/$(APP_NAME)"

uninstall:
	@rm -rf "$(INSTALL_DIR)/$(APP_NAME)"
	@echo "Removed $(INSTALL_DIR)/$(APP_NAME)"

clean:
	swift package clean
	rm -rf .build

# --- Quality ---

test:
	swift test

format:
	swift format format --recursive --in-place Sources/ Tests/

lint:
	swift format lint --recursive --strict Sources/ Tests/

# Run all checks: lint + test + build
check: lint test build
	@echo "All checks passed."

