# *****************************************************************************
# Copyright (C) 2024 EclipseSource GmbH.
#
# This program and the accompanying materials are made available under the
# terms of the Eclipse Public License v. 2.0 which is available at
# http://www.eclipse.org/legal/epl-2.0.
#
# This Source Code may also be made available under the following Secondary
# Licenses when the conditions for such availability set forth in the Eclipse
# Public License v. 2.0 are satisfied: GNU General Public License, version 2
# with the GNU Classpath Exception which is available at
# https://www.gnu.org/software/classpath/license.html.
#
# SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
# *****************************************************************************
import sys
from aider.main import main as aider_main
import aider.main  # Import aider.main to access InputOutput

from custom_io import CustomInputOutput

# Monkey-patch InputOutput in aider.main
aider.main.InputOutput = CustomInputOutput

def custom_main(argv=None, input=None, output=None, force_git_root=None, return_coder=False):
    # Call the original aider_main function
    return aider_main(
        argv=argv,
        input=input,
        output=output,
        force_git_root=force_git_root,
        return_coder=return_coder,
    )

if __name__ == "__main__":
    # Run the custom main with command-line arguments
    sys.exit(custom_main())
