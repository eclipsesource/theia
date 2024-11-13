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
import socket
import sys
from aider.coders import Coder
from aider.io import InputOutput
from aider.main import main as cli_main
import traceback
import json

tool_output_start = '[~tool_output~]'
tool_output_end = '[~/tool_output~]'

tool_warning_start = '[~tool_warning~]'
tool_warning_end = '[~/tool_warning~]'

tool_error_start = '[~tool_warning~]'
tool_error_end = '[~/tool_warning~]'

output_start = '[~output~]'
output_end = '[~/output~]'

tools_start = '[~tools~]'
tools_end = '[~/tools~]'

confirm_ask_start = '[~confirm_ask~]'
confirm_ask_end = '[~/confirm_ask~]'

prompt_ask_start = '[~prompt_ask~]'
prompt_ask_end = '[~/prompt_ask~]'

request_end = '~END_REQUEST~'

class StdioInputOutput(InputOutput):
    lines = []

    def get_captured_lines(self):
        lines = self.lines
        self.lines = []
        return lines

    def tool_output(self, *messages, log_only=False, bold=False):
        self.lines.append({
            "type": "tool_output",
            "messages": messages
        })
        print(f"tool_output: {', '.join(messages)}",file=sys.stderr)
        # super().tool_output(*messages, log_only=log_only, bold=bold)

    def tool_error(self, message="", strip=True):
        self.lines.append({
            "type": "tool_error",
            "messages": message
        })
        print(f"tool_error: {message}",file=sys.stderr)
        # super().tool_error(msg)

    def tool_warning(self, message="", strip=True):
        self.lines.append({
            "type": "tool_warning",
            "messages": message
        })
        print(f"tool_warning: {message}",file=sys.stderr)
        # super().tool_warning(msg)

    def confirm_ask(
        self,
        question,
        default="y",
        subject=None,
        explicit_yes_required=False,
        group=None,
        allow_never=False,
    ):
        valid_responses = ["yes", "no"]
        options = " (Y)es/(N)o"
        if group:
            if not explicit_yes_required:
                options += "/(A)ll"
                valid_responses.append("all")
            options += "/(S)kip all"
            valid_responses.append("skip all")
        if allow_never:
            options += "/(D)on't ask again"
            valid_responses.append("don't ask again")

        question += options + " [Yes]: "


        print('\n')
        print('<question>')
        print(json.dumps({"type": "question","text": question, "options": valid_responses}))
        print('</question>')
        print(output_end)
        print(request_end, end="", flush=True)

        while True:
            # block until we have a valid answer
            res = input().strip()
            if not res:
                res = default
                break
            res = res.lower()
            good = any(valid_response.startswith(res) for valid_response in valid_responses)
            if good:
                res = res[0]
                break

            error_message = f"Please answer with one of: {', '.join(valid_responses)}"
            print(output_start)
            print(error_message)
            print(output_end)
            print(request_end, end="", flush=True)

        if explicit_yes_required:
            is_yes = res == "y"
        else:
            is_yes = res in ("y", "a")

        print(output_start)
        return is_yes
    
    def print():
        return

class TheiaWrapper:

    def __init__(self):
        try:
            self.coder = cli_main(return_coder=True)
            self.io = StdioInputOutput(pretty=False)
            self.io.yes = False
            self.io.dry_run = True
            self.coder.dry_run = True
            self.coder.io = self.io # this breaks the input_history
            self.coder.repo_map.io = self.io

            # Force the coder to cooperate, regardless of cmd line args
            self.coder.yield_stream = True
            self.coder.stream = True
            self.coder.pretty = False
            
        except Exception as e:
            print(f"Error during configuration: {e}", file=sys.stderr)
        
        print("Theia Wrapper started", end="", flush=True)

        while True:
            # Get user input via stdin
            user_input = input()

            # Exit condition
            if user_input.lower() == 'exit':
                self.io.print("Exiting.")
                break

            try:
                print(output_start)
                for data_chunk in self.coder.run_stream(user_input):
                    pass
                print(output_end)
            except Exception as e:
                print(f"Error while sending stream: {e}", file=sys.stderr)
                traceback.print_exc()
            
            # try:
            #     if self.coder.reflected_message is not None:
            #         conn.sendall('reflected_message:\n')
            #         reflected_message = self.coder.reflected_message
            #         reflected_message = ", ".join(reflected_message)
            #         conn.sendall(reflected_message)
            #         conn.sendall('\n\n')
            # except Exception as e:
            #     print(f"Error while sending reflected_message: {e}", file=sys.stderr)
            
            # try:
            #     if self.coder.aider_edited_files is not None:
            #         fnames = [f"`{fname}`" for fname in self.coder.aider_edited_files]
            #         fnames = ", ".join(fnames)
            #         conn.sendall(f"Applied edits to {fnames}.")
            #         conn.sendall('\n\n')
            # except Exception as e:
            #     print(f"Error while sending aider_edited_files: {e}", file=sys.stderr)

            # try:
            #     if self.coder.last_aider_commit_hash:
            #         commits = f"{self.coder.last_aider_commit_hash}~1"
            #         diff = self.coder.repo.diff_commits(
            #             self.coder.pretty,
            #             commits,
            #             self.coder.last_aider_commit_hash,
            #         )
            #         if diff:
            #             diff = ", ".join(diff)
            #             conn.sendall(diff)

            # except Exception as e:
            #     print(f"Error while sending diff: {e}", file=sys.stderr)

            
            # Capture additional messages accumulated in the IO object
            # try:
            #     # conn.sendall(tools_start)
            #     for message in self.io.get_captured_lines():
            #         # conn.sendall(f"{json.dumps(message)}\n")
            #         print(f"{json.dumps(message)}\n")
            #     # conn.sendall(tools_end)
            # except Exception as e:
            #     print(f"Error while sending captured message: {e}", file=sys.stderr)
            #     traceback.print_exc()

            print(request_end,  end="", flush=True)

def custom_main():
    TheiaWrapper()
    

if __name__ == "__main__":
    # Run the custom main with command-line arguments
    sys.exit(custom_main())
