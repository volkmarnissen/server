NAME=$1
# terminate on error
set -e 
if [ "$#" -lt 2 ] || ! [ -d "$1" ];
then
 echo "$#"
 echo 'usage $0 <folder> <release-tag>'
 echo 'creates a clean folder and executes build, tests and releases'
 exit 2
fi
rm -rf $1
git clone git@github.com:modbus2mqtt/$1.git
cd $1
npm install
npm ci
npm run build
npm test
git tag  -d  $2
git push origin :refs/tags/$2
git tag  $2
git push origin --tags

