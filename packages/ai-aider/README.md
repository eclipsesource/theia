<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - Aider Chat EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/ai-aider` integrates the popular `aider-chat` chatbot into the Theia IDE.

When using Aider be aware of the special behavior it has.
It doesn't automatically look at files in the git repo it scanned.
You have to manually feed it with the file it should look at using its internal /add command.
Please be also aware that when you add a file or folder it must be the full relative path from the root of the git repo, e.g. to add the ai-openai package so aider can look at it use: /add packages/ai-openai

## Preconditions

-   Needs python3, pip and venv to be installed:
    -   Ubuntu packages: `python3-pip`, `python3-venv` (python2 is usually pre-installed already)
    -   Windows: [Python](https://www.python.org/downloads/)
    -   MacOS: `brew install python`

## Building the Aider Python Wrapper

Ensure to run `yarn prepare`. This will run `./aider-chat-wrapper/setupPython.js` which will create a python virtual environment and install the required dependencies.

## Testing the Aider Python Wrapper

Run `python3 ./aider-chat-wrapper/aider-main.py`

## Additional Information

-   [Theia - GitHub](https://github.com/eclipse-theia/theia)
-   [Theia - Website](https://theia-ide.org/)

## License

-   [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
-   [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
