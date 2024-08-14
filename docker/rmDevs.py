import json
import sys
import pprint

pkg = json.load ( sys.stdin )
del pkg["devDependencies"]
json.dump(pkg, sys.stdout)
