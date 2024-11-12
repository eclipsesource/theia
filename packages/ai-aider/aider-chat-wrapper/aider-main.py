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

    def set_connection(self, conn):
        """
        Sets the socket connection.
        """
        self.conn = conn
    
    def get_captured_lines(self):
        lines = self.lines
        self.lines = []
        return lines

    def tool_output(self, *messages, log_only=False, bold=False):
        self.lines.append({
            "type": "tool_output",
            "messages": messages
        })
        super().tool_output(*messages, log_only=log_only, bold=bold)

    def tool_error(self, msg):
        self.lines.append({
            "type": "tool_error",
            "messages": msg
        })
        super().tool_error(msg)

    def tool_warning(self, msg):
        self.lines.append({
            "type": "tool_warning",
            "messages": msg
        })
        super().tool_warning(msg)

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
            valid_responses.append("skip")
        if allow_never:
            options += "/(D)on't ask again"
            valid_responses.append("don't")

        question += options + " [Yes]: "


        self.conn.sendall('\n'.encode('utf-8'))
        self.conn.sendall('<question>'.encode('utf-8'))
        self.conn.sendall(json.dumps({"type": "question","text": question, "options": valid_responses}).encode('utf-8'))
        self.conn.sendall('</question>'.encode('utf-8'))
        self.conn.sendall(output_end.encode('utf-8'))
        self.conn.sendall(request_end.encode('utf-8'))

        while True:
            # block until we have a valid answer
            res = self.conn.recv(1024).decode('utf-8').strip()
            if not res:
                res = default
                break
            res = res.lower()
            good = any(valid_response.startswith(res) for valid_response in valid_responses)
            if good:
                res = res[0]
                break

            error_message = f"Please answer with one of: {', '.join(valid_responses)}"
            self.conn.sendall(output_start.encode('utf-8'))
            self.conn.sendall(error_message.encode('utf-8'))
            self.conn.sendall(output_end.encode('utf-8'))
            self.conn.sendall(request_end.encode('utf-8'))

        if explicit_yes_required:
            is_yes = res == "y"
        else:
            is_yes = res in ("y", "a")

        self.conn.sendall(output_start.encode('utf-8'))
        return is_yes
    

class TheiaWrapper:

    def __init__(self, conn):
        try:
            self.coder = cli_main(return_coder=True)
            self.io = StdioInputOutput(pretty=False, yes=None, dry_run=True)
            self.io.set_connection(conn)  # Set the connection after instantiation
            self.coder.io = self.io # this breaks the input_history

            # Force the coder to cooperate, regardless of cmd line args
            self.coder.yield_stream = True
            self.coder.stream = True
            self.coder.pretty = False
        except Exception as e:
            print(f"Error during configuration: {e}", file=sys.stderr)
        
        print("Theia Wrapper started", end="", flush=True)

        while True:
            # Get user input via stdin
            user_input = conn.recv(1024).decode('utf-8')

            # Exit condition
            if user_input.lower() == 'exit':
                self.io.print("Exiting.")
                break

            try:
                conn.sendall(output_start.encode('utf-8'))
                for data_chunk in self.coder.run_stream(user_input):
                    conn.sendall(data_chunk.encode('utf-8'))
                conn.sendall(output_end.encode('utf-8'))
            except Exception as e:
                print(f"Error while sending stream: {e}", file=sys.stderr)
                traceback.print_exc()
            
            # try:
            #     if self.coder.reflected_message is not None:
            #         conn.sendall('reflected_message:\n'.encode('utf-8'))
            #         reflected_message = self.coder.reflected_message
            #         reflected_message = ", ".join(reflected_message)
            #         conn.sendall(reflected_message.encode('utf-8'))
            #         conn.sendall('\n\n'.encode('utf-8'))
            # except Exception as e:
            #     print(f"Error while sending reflected_message: {e}", file=sys.stderr)
            
            # try:
            #     if self.coder.aider_edited_files is not None:
            #         fnames = [f"`{fname}`" for fname in self.coder.aider_edited_files]
            #         fnames = ", ".join(fnames)
            #         conn.sendall(f"Applied edits to {fnames}.".encode('utf-8'))
            #         conn.sendall('\n\n'.encode('utf-8'))
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
            #             conn.sendall(diff.encode('utf-8'))

            # except Exception as e:
            #     print(f"Error while sending diff: {e}", file=sys.stderr)

            
            # Capture additional messages accumulated in the IO object
            try:
                # conn.sendall(tools_start.encode('utf-8'))
                for message in self.io.get_captured_lines():
                    # conn.sendall(f"{json.dumps(message)}\n".encode('utf-8'))
                    print(f"{json.dumps(message)}\n")
                # conn.sendall(tools_end.encode('utf-8'))
            except Exception as e:
                print(f"Error while sending captured message: {e}", file=sys.stderr)
                traceback.print_exc()

            conn.sendall(request_end.encode('utf-8'))

def custom_main():
    host = '127.0.0.1'
    port = 65432
    print("Start python", flush=True)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        server_socket.bind((host, 0))
        assigned_port = server_socket.getsockname()[1]
        print(f"Server listening on {assigned_port}", flush=True)
        server_socket.listen()

        conn, addr = server_socket.accept()
        with conn:
            print(f"Connected by {addr}")
            TheiaWrapper(conn)
    

if __name__ == "__main__":
    # Run the custom main with command-line arguments
    sys.exit(custom_main())
