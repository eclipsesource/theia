# Performance measurements

This directory contains a script that measures the performance of theia.
Currently the support is limited to measuring the `browser-app`s startup time using the `Largest contentful Paint (LCP)` value.

## Running the script

### Prerequisites

To run the script the theia backend needs to be started.
This can either be done with the `Launch Browser Backend` launch config or by running `yarn start` in the `examples/browser-app` directory.

Additionally, the root package.json file contains node scripts that startup the backend as well as the script. Like the `performance:startup` script.

### Executing the script

The script can be exectued using `node measure-performance.js` in this directory.

The script accepts the following parameters:

-   `--name`: Specify a name for the current measurement (default: `Measurement`)
-   `--url`: Point theia to a url for example for specifying a specifc workspace (default: `http://localhost:3000/#/<absolutePathToWorkspaceFolder>`)
-   `--file`: File name for the generated tracing file (default: `profiles/profile.json`)
-   `--headless`: Boolean value for running the tests `headless`/`headful` (default: `true`)
-   `--runs`: Number of runs for the measurement (default: `10`)

_**Note**: When multiple runs are specified the script will calculate the mean and the standard deviation of all values._
