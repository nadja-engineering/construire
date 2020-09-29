import { runInContext } from 'vm';

const exec = require('sync-exec');
const chalk = require('chalk');
const fs = require('fs');
const rmdir = require('rimraf');
const ncp = require('ncp');
const path = require('path');

export function cli(args) {
    const command = process.argv[2];

    switch (command) {
        case 'build':
            buildCommand();
            break;
        default:
            runCommand();
    }
}

const runCommand = async () => {

    const targetFile = process.argv[2];
    assert(targetFile != null, 'INPUT ERROR: please input target file');

    await packagePreprocessor(targetFile);
    let contents = modulePreprocessor(targetFile);

    const functionName = contents.split('exports.')[1].split('=')[0].trim();
    contents += '\n(async () => {let output = await exports.' + functionName + '();console.log(output);})();';

    fs.writeFileSync('./tmp-construire-builds/index.js', contents);
    console.log(exec('node tmp-construire-builds/index').stdout);
    rmdir.sync('./tmp-construire-builds');
}

const assert = (condition, errorDescription) => {
    if (!condition) {
        console.log(chalk.redBright(errorDescription));
        process.exit(1);
    }
}

const packagePreprocessor = async (targetFile) => {
    
    let contents = fs.readFileSync(targetFile, 'utf8');

    let assertPackage = contents.indexOf('// package \'');
    assert((assertPackage != -1), 'BUILD ERROR: package not found at ' + targetFile);

    let packageLocation = contents.split('// package \'')[1].split('\'')[0];

    rmdir.sync('./tmp-construire-builds');
    fs.mkdirSync('./tmp-construire-builds');
    await copyDirectory(path.normalize(targetFile + '/../' +  packageLocation), './tmp-construire-builds');
}

const copyDirectory = (source, destination) => {
    return new Promise((resolve, reject) => {
        ncp(source, destination, (err) => {
            if (err) console.error(chalk.redBright('BUILD ERROR: package not found at ' + source));
            else resolve('Success');
        });
    });
}

const modulePreprocessor = (targetFile) => {

    let contents = fs.readFileSync(targetFile, 'utf8');

    let splitedContents = contents.split('// import \'');
    if (splitedContents.length == 1) {
        return contents;
    }

    for (let i = 1; i < splitedContents.length; i++) {

        const moduleLocation = splitedContents[i].split('\'')[0];
        let moduleContents;

        try {
            moduleContents = fs.readFileSync(path.normalize(targetFile + '/../' + moduleLocation), 'utf8');
        } catch (e) {
            console.log(chalk.redBright('ERROR MODULE NOT FOUND:\n-->> ' + splitedContents[i].substring(0, 200)));
            process.exit(1);
        }

        contents = contents.replace('// import \'' + moduleLocation + '\'', moduleContents);
    }

    return contents;
}

const buildCommand = async () => {
    const functionList = JSON.parse(fs.readFileSync('function-list.json'));

    for (let eachFunction of functionList) {
        console.log(chalk.yellowBright('⌛️ Building function ' + eachFunction.functionName + '...'));
        
        await packagePreprocessor(eachFunction.functionFile);
        console.log(chalk.greenBright('\t✔️ Initiailized packages'));

        const contents = modulePreprocessor(eachFunction.functionFile);
        console.log(chalk.greenBright('\t✔️ Replaced preprocessor'));

        fs.writeFileSync('./tmp-construire-builds/index.js', contents);
        exec('cd tmp-construire-builds; zip function.zip -r .');
        exec('aws lambda update-function-code --function-name ' + eachFunction.functionName + ' --zip-file fileb://tmp-construire-builds/function.zip');
        console.log(chalk.greenBright('\t✔️ Deploy function to AWS Lambda'));

        rmdir.sync('./tmp-construire-builds');
        rmdir.sync('./function.zip');

        console.log(chalk.greenBright('✔️ ') + chalk.bgGreen(chalk.whiteBright('Build Success')) + chalk.greenBright(' function ' + eachFunction.functionName));
    }
}

