import React, { useEffect, useState } from 'react'
import { Box, Text, useStdout } from 'ink'
import { MessageBuffer, type BufferedMessage } from './messageBuffer'
import { useSwitchControls } from './useSwitchControls'

interface GlmDisplayProps {
    messageBuffer: MessageBuffer
    logPath?: string
    onExit?: () => void
    onSwitchToLocal?: () => void
}

function extractModelTag(messages: BufferedMessage[]): string | null {
    const prefix = '[MODEL:'
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.type !== 'system' || !msg.content.startsWith(prefix)) continue
        const match = msg.content.match(/\[MODEL:(.+?)\]/)
        if (match?.[1]) return match[1]
    }
    return null
}

export const GlmDisplay: React.FC<GlmDisplayProps> = ({
    messageBuffer,
    logPath,
    onExit,
    onSwitchToLocal
}) => {
    const [messages, setMessages] = useState<BufferedMessage[]>([])
    const [model, setModel] = useState<string | null>(null)
    const { confirmationMode, actionInProgress } = useSwitchControls({
        onExit,
        onSwitch: onSwitchToLocal
    })
    const { stdout } = useStdout()
    const terminalWidth = stdout.columns || 80
    const terminalHeight = stdout.rows || 24

    useEffect(() => {
        setMessages(messageBuffer.getMessages())
        const unsubscribe = messageBuffer.onUpdate((newMessages) => {
            setMessages(newMessages)
            const nextModel = extractModelTag(newMessages)
            if (nextModel) setModel(nextModel)
        })
        return unsubscribe
    }, [messageBuffer])

    const getMessageColor = (type: BufferedMessage['type']): string => {
        switch (type) {
            case 'user': return 'magenta'
            case 'assistant': return 'cyan'
            case 'system': return 'blue'
            case 'tool': return 'yellow'
            case 'result': return 'green'
            case 'status': return 'gray'
            default: return 'white'
        }
    }

    const formatMessage = (msg: BufferedMessage): string => {
        const maxLineLength = Math.max(1, terminalWidth - 10)
        return msg.content.split('\n').map(line => {
            if (line.length <= maxLineLength) return line
            const chunks: string[] = []
            for (let i = 0; i < line.length; i += maxLineLength) {
                chunks.push(line.slice(i, i + maxLineLength))
            }
            return chunks.join('\n')
        }).join('\n')
    }

    const visibleMessages = messages.filter(msg =>
        !(msg.type === 'system' && msg.content.startsWith('[MODEL:'))
    )

    return (
        <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
            <Box
                flexDirection="column"
                width={terminalWidth}
                height={terminalHeight - 4}
                borderStyle="round"
                borderColor="gray"
                paddingX={1}
                overflow="hidden"
            >
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="gray" bold>GLM Agent Messages</Text>
                    <Text color="gray" dimColor>{'-'.repeat(Math.min(terminalWidth - 4, 60))}</Text>
                </Box>
                <Box flexDirection="column" height={terminalHeight - 10} overflow="hidden">
                    {visibleMessages.length === 0 ? (
                        <Text color="gray" dimColor>Waiting for messages...</Text>
                    ) : (
                        visibleMessages
                            .slice(-Math.max(1, terminalHeight - 10))
                            .map((msg) => (
                                <Box key={msg.id} flexDirection="column" marginBottom={1}>
                                    <Text color={getMessageColor(msg.type)} dimColor>
                                        {formatMessage(msg)}
                                    </Text>
                                </Box>
                            ))
                    )}
                </Box>
            </Box>
            <Box
                width={terminalWidth}
                borderStyle="round"
                borderColor={
                    actionInProgress ? 'gray' :
                    confirmationMode === 'exit' ? 'red' :
                    'green'
                }
                paddingX={2}
                justifyContent="center"
                alignItems="center"
                flexDirection="column"
            >
                <Box flexDirection="column" alignItems="center">
                    {actionInProgress === 'exiting' ? (
                        <Text color="gray" bold>Exiting agent...</Text>
                    ) : confirmationMode === 'exit' ? (
                        <Text color="red" bold>Press Ctrl-C again to exit</Text>
                    ) : (
                        <Text color="green" bold>GLM running (Ctrl-C to exit)</Text>
                    )}
                    {model && (
                        <Text color="gray" dimColor>Model: {model}</Text>
                    )}
                    {process.env.DEBUG && logPath && (
                        <Text color="gray" dimColor>Debug logs: {logPath}</Text>
                    )}
                </Box>
            </Box>
        </Box>
    )
}
