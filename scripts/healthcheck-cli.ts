import {healthcheckMain} from './healthcheck.js';
healthcheckMain(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(()=>{console.error('Invalid healthcheck arguments or report path');process.exitCode=1;});
