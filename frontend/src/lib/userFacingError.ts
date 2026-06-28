type UserFacingErrorContext = {
    action: string
    resource: string
}

const supportMessage = 'If the issue continues, contact support.'

const generateReferenceId = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const idLength = 6

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const values = new Uint8Array(idLength)
        crypto.getRandomValues(values)

        return Array.from(values, (value) => alphabet[value % alphabet.length]).join('')
    }

    return Array.from({ length: idLength }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export const buildUserFacingErrorMessage = ({ action, resource }: UserFacingErrorContext) => {
    const referenceId = generateReferenceId()
    return `We couldn't ${action} your ${resource}. Please try again. ${supportMessage} Reference ID: ${referenceId}`
}