const minioClient = require('../config/minio');
require('dotenv').config();

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'scu-data';

const initializeBucket = async () => {
    try {
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
            console.log(`Bucket ${BUCKET_NAME} created successfully.`);
        }
    } catch (error) {
        console.error('Error initializing MinIO bucket:', error);
    }
};

const uploadFile = async (file, kks, point, measurementType, customFileName, context = 'train', modelName = null, version = null) => {
    const now = new Date();
    const thaiTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));

    const dateStr = thaiTime.getUTCFullYear() +
        String(thaiTime.getUTCMonth() + 1).padStart(2, '0') +
        String(thaiTime.getUTCDate()).padStart(2, '0');
    const timeStr = String(thaiTime.getUTCHours()).padStart(2, '0') +
        String(thaiTime.getUTCMinutes()).padStart(2, '0') +
        String(thaiTime.getUTCSeconds()).padStart(2, '0');

    // Professional Naming pattern: kks_Ppoint_ISO-Time.ext for train
    // Including milliseconds and a random salt to prevent overwriting during rapid bulk uploads
    const isoString = new Date().toISOString();
    const safeTime = isoString.replace(/:/g, '-').replace('.', '-'); // Format: 2026-03-09T13-13-42-123Z
    const randomSalt = Math.random().toString(36).substring(2, 6);
    const uniqueTime = `${safeTime}_${randomSalt}`;
    // Falls back to customFileName or date_time for others
    const ext = file.originalname.split('.').pop().toLowerCase();

    let fileName = customFileName;
    if (!fileName) {
        if (context === 'train') {
            fileName = `${kks || 'UNK'}_P${point || '0'}_${uniqueTime}.${ext}`;
        } else {
            const defaultFileName = `${kks || 'UNK'}_P${point || '0'}_${dateStr}_${timeStr}.${ext}`;
            fileName = defaultFileName;
        }
    }

    // Build hierarchy: kks/P{point}/{type}/models/{modelName}/v{version}/train/ (for training data)
    // or kks/P{point}/{type}/inference/YYYY-MM-DD/ (for inference)
    let folderPath = '';
    const typeFolder = measurementType || 'vibration';

    if (kks && point) {
        if (context === 'inference') {
            const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
            folderPath = `${kks}/P${point}/${typeFolder}/${context}/${today}/`;
        } else if (context === 'train' && modelName && version) {
            folderPath = `${kks}/P${point}/${typeFolder}/models/${modelName}/v${version}/train/`;
        } else if (context === 'train' && modelName) {
            folderPath = `${kks}/P${point}/${typeFolder}/models/${modelName}/train/`;
        } else {
            folderPath = `${kks}/P${point}/${typeFolder}/${context}/`;
        }
    } else if (kks) {
        folderPath = `${kks}/${context}/`;
    } else {
        folderPath = `${context}/general/`;
    }

    const objectName = `${folderPath}${fileName}`;

    try {
        await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, {
            'Content-Type': file.mimetype,
            'x-amz-meta-kks': kks,
            'x-amz-meta-point': point,
            'x-amz-meta-type': typeFolder
        });

        return {
            fileName: objectName,
            bucketName: BUCKET_NAME,
            url: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET_NAME}/${objectName}`,
            metadata: {
                kks, point, type: typeFolder, context, fileName
            }
        };
    } catch (error) {
        console.error('MinIO upload error:', error);
        throw new Error('Failed to upload file to MinIO');
    }
};

const deleteFolder = async (folderPrefix) => {
    try {
        const objectsList = [];
        const stream = minioClient.listObjectsV2(BUCKET_NAME, folderPrefix, true);

        for await (const obj of stream) {
            objectsList.push(obj.name);
        }

        if (objectsList.length > 0) {
            await minioClient.removeObjects(BUCKET_NAME, objectsList);
            console.log(`Successfully deleted ${objectsList.length} objects under ${folderPrefix}`);
        } else {
            console.log(`No objects found under ${folderPrefix} to delete.`);
        }
    } catch (error) {
        console.error(`Error deleting folder ${folderPrefix} from MinIO:`, error);
        throw new Error(`Failed to delete folder from MinIO: ${error.message}`);
    }
};

const uploadToAll = async (file, customFileName) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    const fileName = customFileName || `${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
    const objectName = `all/${fileName}`;

    try {
        await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, {
            'Content-Type': file.mimetype
        });

        return {
            fileName: objectName,
            bucketName: BUCKET_NAME,
            url: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET_NAME}/${objectName}`
        };
    } catch (error) {
        console.error('MinIO uploadToAll error:', error);
        throw new Error('Failed to upload file to MinIO all folder');
    }
};

const listObjects = async (prefix) => {
    try {
        const objectsList = [];
        const stream = minioClient.listObjectsV2(BUCKET_NAME, prefix, true);

        for await (const obj of stream) {
            objectsList.push({
                name: obj.name,
                size: obj.size,
                lastModified: obj.lastModified,
                etag: obj.etag
            });
        }

        return objectsList;
    } catch (error) {
        console.error(`Error listing objects with prefix ${prefix} from MinIO:`, error);
        throw new Error(`Failed to list objects from MinIO: ${error.message}`);
    }
};

module.exports = {
    initializeBucket,
    uploadFile,
    uploadToAll,
    deleteFolder,
    listObjects,
    BUCKET_NAME
};
