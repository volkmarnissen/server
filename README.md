# Introduction to modbus2mqtt 
[Introduction](introduction.md)
# server 
server for modbus2mqtt for REST API of configuration and publishing modbus values to mqtt

**modbus2mqtt** consists of the following packages:
1. **../specification.shared**: Type definitions and enumerations used for specifications on the **../server** and **../angular** 
2. **../specification**: Implementation of classes and functions to handle specifications on the file system and in github
3. **../server.shared**: Type definitions and enumerations used for configuration, busses and slaves on the **../server** and **../angular** 
4. **../server**: Implementation of classes and functions to provide REST API for the **../angular** and polling of mqtt and modbus and file handling for busses and slaves
5. **../angular**: Angular configuration UI for **modbus2mqtt**


## Installation

### Development Setup

After cloning the repository, install Git hooks to ensure code formatting:

```bash
npm install
npm run install-hooks
```

The pre-commit hook will automatically run `prettier` on staged files before each commit.

