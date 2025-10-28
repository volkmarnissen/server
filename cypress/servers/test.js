
const fs = require('fs')


data = fs.readFileSync('cypress/servers/tmpfiles','utf-8')
              var args=3004
              var re = new RegExp(args + " (.*)\n");
              var matches = re.exec(data)
              if(matches && matches.length >1)
                resolve(matches[1])
              else
                console.log('getTempDir: args not found in tmpfiles ' + 'xxx' + ' ' )              
        