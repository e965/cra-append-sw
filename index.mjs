#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import MemoryFs from 'memory-fs';
import webpack from 'webpack';
import Dotenv from 'dotenv-webpack';
import TerserPlugin from 'terser-webpack-plugin';
import program from 'commander';

const BUILD_SW_FILE_PATH = 'build/service-worker.js';
const BUNDLE_FILE_NAME = 'bundle.js';

/**
 * Command line options
 */
program
    .arguments('<file>')
    .option('-s, --skip-compile', 'skip compilation')
    .option('-e, --env [path]', 'path to environment variables files [./.env]', './.env')
    .option('-t, --tsconfig [path]', 'path to tsconfig file [./tsconfig.json]', './tsconfig.json')
    .option('-m, --mode <mode>', 'output mode [dev|build|replace]', /^(dev|build|replace)$/i)
    .action(function (file) {
        if (program.mode === 'dev') {
            process.env.BABEL_ENV = 'development';
            process.env.NODE_ENV = 'development';
        } else {
            process.env.BABEL_ENV = 'production';
            process.env.NODE_ENV = 'production';
        }

        if (program.skipCompile) {
            read(file).then(result => append(result, file));
        } else {
            compile(file).then(({ result, stats }) => append(result, file));
        }
    })
    .parse(process.argv);

/**
 * Compile entry file using WebPack
 *
 * @param {String} entry Path to entry file
 * @returns {Promise}
 */
function compile(entry) {
    const commonExclude = /(node_modules|bower_components)/;

    const compiler = webpack({
        mode: program.mode === 'dev' ? 'development' : 'production',
        entry: [entry],
        output: {
            filename: BUNDLE_FILE_NAME,
            path: '/',
        },
        module: {
            rules: [
                {
                    test: /\.ts?$/,
                    exclude: new RegExp(commonExclude),
                    use: {
                        loader: 'ts-loader',
                        options: {
                            configFile: path.join(process.cwd(), program.tsconfig),
                        },
                    },
                },
                {
                    test: /\.js$/,
                    exclude: new RegExp(commonExclude),
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                [
                                    'react-app',
                                    {
                                        targets: {
                                            browsers: ['defaults'],
                                        },
                                    },
                                ],
                            ],
                            plugins: ['@babel/plugin-transform-runtime'],
                        },
                    },
                },
            ],
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        plugins: [
            new Dotenv({
                path: path.join(process.cwd(), program.env),
                safe: false,
                silent: true,
                systemvars: true,
                expand: true,
            }),
        ],
        optimization: {
            minimize: true,
            minimizer: [new TerserPlugin()],
        },
    });

    compiler.outputFileSystem = new MemoryFs();

    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err) return reject(err);

            if (stats.hasErrors() || stats.hasWarnings()) {
                return reject(
                    new Error(
                        stats.toString({
                            errorDetails: true,
                            warnings: true,
                        })
                    )
                );
            }

            const result = compiler.outputFileSystem.data[BUNDLE_FILE_NAME].toString();
            resolve({ result, stats });
        });
    });
}

/**
 * Read entry file
 *
 * @param {String} entry Path to entry file
 * @returns {Promise}
 */
function read(entry) {
    return new Promise((resolve, reject) => {
        fs.readFile(entry, 'utf8', (error, result) => {
            if (error) {
                reject(error);
            }

            resolve(result);
        });
    });
}

/**
 * Append custonm code to exisitng ServiceWorker
 *
 * @param {String} code
 * @returns {Promise}
 */
function append(code, file) {
    if (program.mode === 'dev') {
        const filename = path.basename(file);
        return writeFile(code, `public/${filename}`);
    } else if (program.mode === 'build') {
        const filename = path.basename(file);
        return writeFile(code, `build/${filename}`);
    } else if (program.mode === 'replace') {
        const filename = path.basename(file);
        return writeFile(code, BUILD_SW_FILE_PATH);
    } else {
        // Append to "build/service-worker.js"
        return new Promise((resolve, reject) => {
            // Read exisitng SW file
            fs.readFile(BUILD_SW_FILE_PATH, 'utf8', (error, data) => {
                if (error) {
                    reject(error);
                }

                // append custom code
                const result = data + code;

                // Write modified SW file
                fs.writeFile(BUILD_SW_FILE_PATH, result, 'utf8', error => {
                    if (error) {
                        reject(error);
                    }

                    resolve();
                });
            });
        });
    }
}

function writeFile(content, file) {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, content, 'utf8', error => {
            if (error) {
                reject(error);
            }
            resolve();
        });
    });
}
