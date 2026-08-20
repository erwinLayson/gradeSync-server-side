export default function NormalizedData(data: string, important?: boolean): string {
    if(data === null || data === undefined || data === "") {
        return "";
    }

    if(important) {
        const normalized = data.slice(0,1).toUpperCase() + data.slice(1).toLowerCase();
        return normalized;
    }

    return data.toLocaleLowerCase().trim();
}