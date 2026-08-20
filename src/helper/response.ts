interface ResponseProps {
    success: true
    message: string;
    data?: any;
}

export function SuccessResponse({ message, data }: Omit<ResponseProps, "success">): ResponseProps {
    return {
        success: true,
        message,
        ...(data && { data })
    };
}