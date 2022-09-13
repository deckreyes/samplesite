package com.aem.samplesite.core.servlets;

/**
 * @author Deck Reyes
 */
public class AssetDetails {

    private String name;
    private String path;
    private String mimeType;
    private String modifier;

    /**
     * @param name
     * @param path
     * @param mimeType
     */
    public AssetDetails(String name, String path, String mimeType, String modifier) {
        this.name = name;
        this.path = path;
        this.mimeType = mimeType;
        this.modifier = modifier;
    }

    /**
     * @return the name
     */
    public String getName() {
        return name;
    }

    /**
     * @param name the name to set
     */
    public void setName(String name) {
        this.name = name;
    }

    /**
     * @return the path
     */
    public String getPath() {
        return path;
    }

    /**
     * @param path the path to set
     */
    public void setPath(String path) {
        this.path = path;
    }

    /**
     * @return the mimeType
     */
    public String getMimeType() {
        return mimeType;
    }

    /**
     * @param mimeType the mimeType to set
     */
    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

     /**
     * @return the lastModified
     */
    public String getModifier() {
        return modifier;
    }

    /**
     * @param mimeType the mimeType to set
     */
    public void setModifier(String modifier) {
        this.modifier = modifier;
    }
}