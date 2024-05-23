import { Command } from "commander";
import { addRegisterValue, logValues, runModbusServer } from "./modbusserver";
import { VERSION } from "ts-node";
import * as fs from 'fs';
import { join } from "path";
import { parse } from 'yaml';


let cli = new Command()
cli.version(VERSION)
cli.usage("[--config <config-dir>] --bus <busid>")
cli.option("-c, --config <config-dir>", "set directory for add on configuration")
cli.option("-b, --bus <busid>", "busid")
cli.parse(process.argv)
let options = cli.opts()
console.log("starting")
if (options['config']){
    let directoryBus = join( options['config'] , 'local/busses/bus.' + options['bus'] )
    let directoryPublicSpecs = join( options['config'] , 'public/specifications' )
    let directoryLocalSpecs = join( options['config'] , 'local/specifications' )
    console.log("read bus" + directoryBus)
    let files = fs.readdirSync(directoryBus);
    
    files.forEach( slaveFileName=>{
        if(slaveFileName.startsWith("s"))
            try {
                console.log("read slave" + slaveFileName)
                let content = fs.readFileSync(join(directoryBus,slaveFileName), { encoding: 'utf8' })
                let slave = parse(content.toString())
                let slaveid= slave.slaveid
                let specFilename = slave.specificationid
                if(specFilename){
                    let fn = join( directoryLocalSpecs, specFilename + ".yaml" )
                    console.log(fn)
                    content = fs.readFileSync(fn, { encoding: 'utf8' })
                    let spec = parse(content.toString())
                
                    if(spec.testdata){
                        let testdata = spec.testdata as {address:number, value:number}[]
                        testdata.forEach(avp=>{
                            let fc = Math.floor(avp.address / 100000)
                            let a = avp.address % 100000
                            addRegisterValue(slaveid,a,fc,avp.value)
                        })
                    }
                
                }
                logValues()
            } catch (e: any) {
                console.error("Unable to read  directory for " + e)
            }
    })
}


runModbusServer(8502)