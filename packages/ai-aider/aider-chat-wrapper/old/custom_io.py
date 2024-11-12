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
import io
import json
import time
from aider.io import InputOutput
from aider.mdstream import MarkdownStream
from rich.console import Console
from rich.text import Text
from custom_mdstream import CustomMarkdownStream

# assistant_output is a method that is called by the Aider CLI to output messages from the assistant
# append_chat_history could be overridden to store chat history in the Theia way
class CustomInputOutput(InputOutput):

    tool_output_start = '[~tool_output~]'
    tool_output_end = '[~/tool_output~]'

    tool_warning_start = '[~tool_warning~]'
    tool_warning_end = '[~/tool_warning~]'

    tool_error_start = '[~tool_warning~]'
    tool_error_end = '[~/tool_warning~]'

    confirm_ask_start = '[~confirm_ask~]'
    confirm_ask_end = '[~/confirm_ask~]'

    prompt_ask_start = '[~prompt_ask~]'
    prompt_ask_end = '[~/prompt_ask~]'

    tool_message_start = '[~tool_message~]'
    tool_message_end = '[~/tool_message~]'

    def tool_output(self, *messages, log_only=False, bold=False):
        self.console.print(self.tool_output_start)
        try:
            # Ensure all messages are strings before joining
            messages = [str(message) for message in messages]
            super().tool_output(*messages, log_only=log_only, bold=bold)
        except TypeError as e:
            self.console.print(f"TypeError in tool_output: {e}", style="bold red")
        self.console.print(self.tool_output_end)
    
    def tool_warning(self, message="", strip=True):
        self.console.print(self.tool_warning_start)
        super().tool_warning(message, strip)
        self.console.print(self.tool_warning_end)
    
    def tool_error(self, message="", strip=True):
        self.console.print(self.tool_error_start)
        super().tool_error(message, strip)
        self.console.print(self.tool_error_end)

    def confirm_ask(
        self,
        question,
        default="y",
        subject=None,
        explicit_yes_required=False,
        group=None,
        allow_never=False,
    ):
        self.console.print(self.confirm_ask_start)
        # self.console.print(json.dumps({
        #     "question": question,
        #     "default": default,
        #     "subject": subject,
        #     "explicit_yes_required": explicit_yes_required,
        #     "group": group,
        #     "allow_never": allow_never
        # }))
        super().confirm_ask(question, default, subject, explicit_yes_required, group, allow_never)
        self.console.print(self.confirm_ask_end)
    
    def prompt_ask(self, question, default="", subject=None):
        self.console.print(self.prompt_ask_end)
        super().prompt_ask(question, default, subject)
        self.console.print(self.prompt_ask_end)
    
    def assistant_output(self, message, pretty=None):
        self.console.print("[~output~]")
        super().assistant_output(message, pretty)
        self.console.print("[~/output~]")

    def tool_message(self, question, default="", subject=None):
        self.console.print(self.tool_message_end)
        super().tool_message(question, default, subject)
        self.console.print(self.tool_message_end)

    def print(self, message):
        self.console.print("[~output~]")
        super().print(message)
        self.console.print("[~/output~]")

    def get_assistant_mdstream(self):
        mdargs = dict(style=self.assistant_output_color, code_theme=self.code_theme)
        mdStream = CustomMarkdownStream(mdargs=mdargs)
        return mdStream